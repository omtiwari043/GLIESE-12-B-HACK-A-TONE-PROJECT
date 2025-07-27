async function handler({
  latitude,
  longitude,
  aod_value,
  no2_value,
  temperature,
  humidity,
  wind_speed,
}) {
  try {
    if (!latitude || !longitude) {
      return {
        success: false,
        error: "Latitude and longitude are required",
      };
    }

    // Fetch comprehensive training data with data quality filters
    const trainingData = await sql`
      SELECT latitude, longitude, pm25_value, aod_value, no2_value, 
             temperature, humidity, wind_speed, measurement_date
      FROM pm25_measurements 
      WHERE pm25_value IS NOT NULL 
        AND pm25_value > 0 
        AND pm25_value < 500
        AND aod_value IS NOT NULL 
        AND no2_value IS NOT NULL
        AND temperature IS NOT NULL
        AND temperature > -50 AND temperature < 60
        AND humidity IS NOT NULL
        AND humidity >= 0 AND humidity <= 100
        AND wind_speed IS NOT NULL
        AND wind_speed >= 0 AND wind_speed < 50
        AND is_prediction = false
      ORDER BY measurement_date DESC
      LIMIT 2000
    `;

    if (trainingData.length < 20) {
      return {
        success: false,
        error: "Insufficient high-quality training data available",
        required: 20,
        available: trainingData.length,
      };
    }

    // Enhanced feature engineering
    const inputLat = parseFloat(latitude);
    const inputLng = parseFloat(longitude);
    const inputAOD = parseFloat(aod_value || 0.15);
    const inputNO2 = parseFloat(no2_value || 0.000025);
    const inputTemp = parseFloat(temperature || 20);
    const inputHumidity = parseFloat(humidity || 50);
    const inputWindSpeed = parseFloat(wind_speed || 5);

    // Advanced feature set with geographic and temporal features
    const currentDate = new Date();
    const features = {
      latitude: inputLat,
      longitude: inputLng,
      aod_value: inputAOD,
      no2_value: inputNO2,
      temperature: inputTemp,
      humidity: inputHumidity,
      wind_speed: inputWindSpeed,
      // Geographic features
      distance_from_equator: Math.abs(inputLat),
      coastal_proximity: Math.min(
        Math.abs(inputLng + 74), // Atlantic
        Math.abs(inputLng + 118), // Pacific
        Math.abs(inputLng + 87) // Gulf
      ),
      // Atmospheric features
      pressure_estimate: 1013.25 - inputLat * 0.5, // Simplified pressure
      pollution_index: inputAOD * 100 + inputNO2 * 1000000,
      // Meteorological interactions
      temp_humidity_interaction: (inputTemp * inputHumidity) / 100,
      wind_dispersion_factor: Math.log(inputWindSpeed + 1),
      // Seasonal approximation
      month: currentDate.getMonth() + 1,
      season_factor: Math.sin((currentDate.getMonth() / 12) * 2 * Math.PI),
    };

    // Enhanced ensemble prediction with multiple algorithms
    let predictions = [];
    const numEnsembles = 15;
    const sampleSize = Math.min(200, Math.floor(trainingData.length * 0.9));

    for (let ensemble = 0; ensemble < numEnsembles; ensemble++) {
      // Random sample for bootstrap aggregation
      const sample = [];
      for (let i = 0; i < sampleSize; i++) {
        const randomIndex = Math.floor(Math.random() * trainingData.length);
        sample.push(trainingData[randomIndex]);
      }

      // Multi-distance weighted prediction
      let totalWeight = 0;
      let weightedSum = 0;
      let localPredictions = [];

      for (const point of sample) {
        const pointLat = parseFloat(point.latitude);
        const pointLng = parseFloat(point.longitude);
        const pointAOD = parseFloat(point.aod_value || 0);
        const pointNO2 = parseFloat(point.no2_value || 0);
        const pointTemp = parseFloat(point.temperature || 20);
        const pointHumidity = parseFloat(point.humidity || 50);
        const pointWindSpeed = parseFloat(point.wind_speed || 5);

        // Multi-dimensional distance calculation
        const geoDistance = Math.sqrt(
          Math.pow(features.latitude - pointLat, 2) +
            Math.pow(features.longitude - pointLng, 2)
        );

        const atmosphericDistance = Math.sqrt(
          Math.pow((features.aod_value - pointAOD) * 200, 2) +
            Math.pow((features.no2_value - pointNO2) * 50000, 2)
        );

        const meteorologicalDistance = Math.sqrt(
          Math.pow((features.temperature - pointTemp) * 0.1, 2) +
            Math.pow((features.humidity - pointHumidity) * 0.01, 2) +
            Math.pow((features.wind_speed - pointWindSpeed) * 0.2, 2)
        );

        // Combined distance with adaptive weighting
        const combinedDistance =
          geoDistance * 1.0 +
          atmosphericDistance * 0.8 +
          meteorologicalDistance * 0.6;

        // Non-linear weight function for better locality
        const weight = Math.exp(-combinedDistance * 2) + 0.001;
        totalWeight += weight;

        const pm25Value = parseFloat(point.pm25_value);
        weightedSum += weight * pm25Value;
        localPredictions.push(pm25Value);
      }

      if (totalWeight > 0 && localPredictions.length > 0) {
        // Primary weighted prediction
        const weightedPrediction = weightedSum / totalWeight;

        // Secondary k-nearest neighbors approach
        const sortedByDistance = sample
          .map((point) => ({
            pm25: parseFloat(point.pm25_value),
            distance: Math.sqrt(
              Math.pow(features.latitude - parseFloat(point.latitude), 2) +
                Math.pow(features.longitude - parseFloat(point.longitude), 2) +
                Math.pow(
                  (features.aod_value - parseFloat(point.aod_value || 0)) * 100,
                  2
                )
            ),
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, Math.min(20, sample.length));

        const knnPrediction =
          sortedByDistance.reduce((sum, item) => sum + item.pm25, 0) /
          sortedByDistance.length;

        // Ensemble combination
        const finalPrediction = weightedPrediction * 0.7 + knnPrediction * 0.3;
        predictions.push(finalPrediction);
      }
    }

    if (predictions.length === 0) {
      return {
        success: false,
        error: "Unable to generate reliable prediction",
      };
    }

    // Advanced statistical analysis of predictions
    predictions.sort((a, b) => a - b);
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    const median = predictions[Math.floor(predictions.length / 2)];
    const q1 = predictions[Math.floor(predictions.length * 0.25)];
    const q3 = predictions[Math.floor(predictions.length * 0.75)];

    // Remove outliers using IQR method for better accuracy
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filteredPredictions = predictions.filter(
      (p) => p >= lowerBound && p <= upperBound
    );
    const finalPrediction =
      filteredPredictions.length > 0
        ? filteredPredictions.reduce((a, b) => a + b, 0) /
          filteredPredictions.length
        : mean;

    // Enhanced confidence calculation
    const variance =
      predictions.reduce(
        (sum, pred) => sum + Math.pow(pred - finalPrediction, 2),
        0
      ) / predictions.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = standardDeviation / finalPrediction;

    // Multi-factor confidence score
    const dataQualityScore = Math.min(1, trainingData.length / 100);
    const predictionStabilityScore = Math.max(0, 1 - coefficientOfVariation);
    const spatialCoverageScore = Math.min(
      1,
      filteredPredictions.length / predictions.length
    );

    const confidence =
      dataQualityScore * 0.3 +
      predictionStabilityScore * 0.5 +
      spatialCoverageScore * 0.2;

    // Validate prediction range
    const validatedPrediction = Math.max(1, Math.min(500, finalPrediction));

    // Store prediction with enhanced metadata
    const predictionRecord = await sql`
      INSERT INTO pm25_measurements (
        latitude, longitude, pm25_value, aod_value, no2_value,
        temperature, humidity, wind_speed, is_prediction, 
        model_version, data_source
      ) VALUES (
        ${inputLat}, ${inputLng}, ${validatedPrediction}, ${inputAOD},
        ${inputNO2}, ${inputTemp}, ${inputHumidity}, ${inputWindSpeed},
        true, 'enhanced_rf_v2.0', 'ml_prediction'
      ) RETURNING id
    `;

    return {
      success: true,
      prediction: {
        pm25_value: Math.round(validatedPrediction * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        latitude: inputLat,
        longitude: inputLng,
        model_version: "enhanced_rf_v2.0",
        prediction_id: predictionRecord[0].id,
        statistics: {
          mean: Math.round(mean * 100) / 100,
          median: Math.round(median * 100) / 100,
          std_deviation: Math.round(standardDeviation * 100) / 100,
          predictions_used: filteredPredictions.length,
          outliers_removed: predictions.length - filteredPredictions.length,
        },
      },
      training_samples: trainingData.length,
      model_performance: {
        data_quality_score: Math.round(dataQualityScore * 100) / 100,
        prediction_stability: Math.round(predictionStabilityScore * 100) / 100,
        spatial_coverage: Math.round(spatialCoverageScore * 100) / 100,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
export async function POST(request) {
  return handler(await request.json());
}