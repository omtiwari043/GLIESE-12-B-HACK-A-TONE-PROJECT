async function handler({
  latitude,
  longitude,
  radius = 50,
  includePredictions = false,
  startDate,
  endDate,
  minDataQuality = 0.8,
}) {
  try {
    if (!latitude || !longitude) {
      return {
        success: false,
        error: "Latitude and longitude are required",
      };
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const searchRadius = parseFloat(radius);

    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return {
        success: false,
        error: "Invalid coordinates provided",
      };
    }

    // Build dynamic query with enhanced data quality filters
    let queryParts = [];
    let params = [];
    let paramIndex = 1;

    // Base query with quality controls
    let baseQuery = `
      SELECT 
        id, latitude, longitude, pm25_value, aod_value, no2_value,
        temperature, humidity, wind_speed, measurement_date, 
        data_source, is_prediction, model_version, created_at,
        -- Calculate data quality score
        CASE 
          WHEN pm25_value IS NOT NULL AND pm25_value > 0 AND pm25_value < 500
            AND (aod_value IS NULL OR (aod_value >= 0 AND aod_value <= 5))
            AND (no2_value IS NULL OR (no2_value >= 0 AND no2_value <= 0.001))
            AND (temperature IS NULL OR (temperature > -50 AND temperature < 60))
            AND (humidity IS NULL OR (humidity >= 0 AND humidity <= 100))
            AND (wind_speed IS NULL OR (wind_speed >= 0 AND wind_speed < 50))
          THEN 1.0
          ELSE 0.0
        END as data_quality_score,
        -- Calculate distance from search point
        SQRT(
          POW((latitude - $${paramIndex}), 2) + 
          POW((longitude - $${paramIndex + 1}), 2)
        ) * 111.32 as distance_km
      FROM pm25_measurements 
      WHERE 1=1
    `;

    params.push(lat, lng);
    paramIndex += 2;

    // Geographic bounds (approximate box filter for performance)
    const degreeRadius = searchRadius / 111.32; // Convert km to degrees
    queryParts.push(`
      AND latitude BETWEEN $${paramIndex} AND $${paramIndex + 1}
      AND longitude BETWEEN $${paramIndex + 2} AND $${paramIndex + 3}
    `);
    params.push(
      lat - degreeRadius,
      lat + degreeRadius,
      lng - degreeRadius,
      lng + degreeRadius
    );
    paramIndex += 4;

    // Data quality filter
    queryParts.push(`
      AND pm25_value IS NOT NULL 
      AND pm25_value > 0 
      AND pm25_value < 500
    `);

    // Include/exclude predictions
    if (!includePredictions) {
      queryParts.push(`AND is_prediction = false`);
    }

    // Date range filter
    if (startDate) {
      queryParts.push(`AND measurement_date >= $${paramIndex}`);
      params.push(new Date(startDate));
      paramIndex++;
    }

    if (endDate) {
      queryParts.push(`AND measurement_date <= $${paramIndex}`);
      params.push(new Date(endDate));
      paramIndex++;
    }

    // Complete query with distance filter and ordering
    const fullQuery = `
      WITH filtered_data AS (
        ${baseQuery}
        ${queryParts.join(" ")}
      )
      SELECT * FROM filtered_data
      WHERE distance_km <= $${paramIndex}
        AND data_quality_score >= $${paramIndex + 1}
      ORDER BY 
        distance_km ASC,
        measurement_date DESC,
        data_quality_score DESC
      LIMIT 500
    `;

    params.push(searchRadius, minDataQuality);

    const measurements = await sql(fullQuery, params);

    // Enhanced post-processing for accuracy
    const processedMeasurements = measurements.map((measurement) => {
      // Validate and clean data
      const cleanedMeasurement = {
        ...measurement,
        pm25_value: Math.round(parseFloat(measurement.pm25_value) * 100) / 100,
        latitude:
          Math.round(parseFloat(measurement.latitude) * 1000000) / 1000000,
        longitude:
          Math.round(parseFloat(measurement.longitude) * 1000000) / 1000000,
        distance_km:
          Math.round(parseFloat(measurement.distance_km) * 100) / 100,
        data_quality_score:
          Math.round(parseFloat(measurement.data_quality_score) * 100) / 100,
      };

      // Add environmental parameter validation
      if (measurement.aod_value !== null) {
        cleanedMeasurement.aod_value =
          Math.round(parseFloat(measurement.aod_value) * 1000000) / 1000000;
      }
      if (measurement.no2_value !== null) {
        cleanedMeasurement.no2_value =
          Math.round(parseFloat(measurement.no2_value) * 1000000000) /
          1000000000;
      }
      if (measurement.temperature !== null) {
        cleanedMeasurement.temperature =
          Math.round(parseFloat(measurement.temperature) * 10) / 10;
      }
      if (measurement.humidity !== null) {
        cleanedMeasurement.humidity =
          Math.round(parseFloat(measurement.humidity) * 10) / 10;
      }
      if (measurement.wind_speed !== null) {
        cleanedMeasurement.wind_speed =
          Math.round(parseFloat(measurement.wind_speed) * 10) / 10;
      }

      return cleanedMeasurement;
    });

    // Calculate comprehensive statistics
    const stats = {
      total_measurements: processedMeasurements.length,
      real_measurements: processedMeasurements.filter((m) => !m.is_prediction)
        .length,
      predictions: processedMeasurements.filter((m) => m.is_prediction).length,
      avg_distance:
        processedMeasurements.length > 0
          ? Math.round(
              (processedMeasurements.reduce(
                (sum, m) => sum + parseFloat(m.distance_km),
                0
              ) /
                processedMeasurements.length) *
                100
            ) / 100
          : 0,
      avg_pm25:
        processedMeasurements.length > 0
          ? Math.round(
              (processedMeasurements.reduce(
                (sum, m) => sum + parseFloat(m.pm25_value),
                0
              ) /
                processedMeasurements.length) *
                100
            ) / 100
          : 0,
      min_pm25:
        processedMeasurements.length > 0
          ? Math.min(
              ...processedMeasurements.map((m) => parseFloat(m.pm25_value))
            )
          : 0,
      max_pm25:
        processedMeasurements.length > 0
          ? Math.max(
              ...processedMeasurements.map((m) => parseFloat(m.pm25_value))
            )
          : 0,
      avg_data_quality:
        processedMeasurements.length > 0
          ? Math.round(
              (processedMeasurements.reduce(
                (sum, m) => sum + parseFloat(m.data_quality_score),
                0
              ) /
                processedMeasurements.length) *
                100
            ) / 100
          : 0,
      data_sources: [
        ...new Set(processedMeasurements.map((m) => m.data_source)),
      ],
      time_range: {
        earliest:
          processedMeasurements.length > 0
            ? new Date(
                Math.min(
                  ...processedMeasurements.map((m) =>
                    new Date(m.measurement_date).getTime()
                  )
                )
              ).toISOString()
            : null,
        latest:
          processedMeasurements.length > 0
            ? new Date(
                Math.max(
                  ...processedMeasurements.map((m) =>
                    new Date(m.measurement_date).getTime()
                  )
                )
              ).toISOString()
            : null,
      },
    };

    // Data completeness analysis
    const completenessStats = {
      pm25_complete: processedMeasurements.filter((m) => m.pm25_value !== null)
        .length,
      aod_complete: processedMeasurements.filter((m) => m.aod_value !== null)
        .length,
      no2_complete: processedMeasurements.filter((m) => m.no2_value !== null)
        .length,
      temperature_complete: processedMeasurements.filter(
        (m) => m.temperature !== null
      ).length,
      humidity_complete: processedMeasurements.filter(
        (m) => m.humidity !== null
      ).length,
      wind_speed_complete: processedMeasurements.filter(
        (m) => m.wind_speed !== null
      ).length,
    };

    return {
      success: true,
      data: processedMeasurements,
      query_parameters: {
        center: { latitude: lat, longitude: lng },
        radius_km: searchRadius,
        include_predictions: includePredictions,
        min_data_quality: minDataQuality,
        start_date: startDate,
        end_date: endDate,
      },
      statistics: stats,
      data_completeness: completenessStats,
      data_quality: {
        high_quality_measurements: processedMeasurements.filter(
          (m) => parseFloat(m.data_quality_score) >= 0.9
        ).length,
        medium_quality_measurements: processedMeasurements.filter(
          (m) =>
            parseFloat(m.data_quality_score) >= 0.7 &&
            parseFloat(m.data_quality_score) < 0.9
        ).length,
        low_quality_measurements: processedMeasurements.filter(
          (m) => parseFloat(m.data_quality_score) < 0.7
        ).length,
      },
    };
  } catch (error) {
    console.error("Database query error:", error);
    return {
      success: false,
      error: error.message,
      details: "Failed to retrieve PM2.5 measurements",
    };
  }
}
export async function POST(request) {
  return handler(await request.json());
}