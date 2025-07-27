async function handler({
  latitude,
  longitude,
  pm25_value,
  aod_value,
  no2_value,
  temperature,
  humidity,
  wind_speed,
  data_source = "manual",
  is_prediction = false,
  model_version,
  prediction_accuracy,
  validation_status = "pending",
}) {
  try {
    if (
      !latitude ||
      !longitude ||
      pm25_value === undefined ||
      pm25_value === null
    ) {
      return {
        success: false,
        error: "Latitude, longitude, and pm25_value are required",
      };
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const pm25 = parseFloat(pm25_value);

    if (isNaN(lat) || isNaN(lng) || isNaN(pm25)) {
      return {
        success: false,
        error: "Invalid numeric values provided",
      };
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        success: false,
        error:
          "Invalid coordinates: latitude must be -90 to 90, longitude must be -180 to 180",
      };
    }

    if (pm25 < 0 || pm25 > 500) {
      return {
        success: false,
        error: "PM2.5 value must be between 0 and 500 μg/m³",
      };
    }

    const validatedData = {
      latitude: lat,
      longitude: lng,
      pm25_value: pm25,
      data_source,
      is_prediction: Boolean(is_prediction),
      validation_status,
    };

    if (aod_value !== undefined && aod_value !== null) {
      const aod = parseFloat(aod_value);
      if (isNaN(aod) || aod < 0 || aod > 5) {
        return {
          success: false,
          error: "AOD value must be between 0 and 5",
        };
      }
      validatedData.aod_value = aod;
    }

    if (no2_value !== undefined && no2_value !== null) {
      const no2 = parseFloat(no2_value);
      if (isNaN(no2) || no2 < 0) {
        return {
          success: false,
          error: "NO2 value must be non-negative",
        };
      }
      validatedData.no2_value = no2;
    }

    if (temperature !== undefined && temperature !== null) {
      const temp = parseFloat(temperature);
      if (isNaN(temp) || temp < -50 || temp > 60) {
        return {
          success: false,
          error: "Temperature must be between -50°C and 60°C",
        };
      }
      validatedData.temperature = temp;
    }

    if (humidity !== undefined && humidity !== null) {
      const hum = parseFloat(humidity);
      if (isNaN(hum) || hum < 0 || hum > 100) {
        return {
          success: false,
          error: "Humidity must be between 0% and 100%",
        };
      }
      validatedData.humidity = hum;
    }

    if (wind_speed !== undefined && wind_speed !== null) {
      const wind = parseFloat(wind_speed);
      if (isNaN(wind) || wind < 0 || wind > 50) {
        return {
          success: false,
          error: "Wind speed must be between 0 and 50 m/s",
        };
      }
      validatedData.wind_speed = wind;
    }

    if (model_version !== undefined && model_version !== null) {
      validatedData.model_version = String(model_version);
    }

    if (prediction_accuracy !== undefined && prediction_accuracy !== null) {
      const accuracy = parseFloat(prediction_accuracy);
      if (isNaN(accuracy) || accuracy < 0 || accuracy > 1) {
        return {
          success: false,
          error: "Prediction accuracy must be between 0 and 1",
        };
      }
      validatedData.prediction_accuracy = accuracy;
    }

    const columns = Object.keys(validatedData);
    const values = Object.values(validatedData);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const columnNames = columns.join(", ");

    const query = `
      INSERT INTO pm25_measurements (${columnNames})
      VALUES (${placeholders})
      RETURNING id, latitude, longitude, pm25_value, measurement_date, created_at
    `;

    const result = await sql(query, values);

    if (result.length === 0) {
      return {
        success: false,
        error: "Failed to create measurement record",
      };
    }

    const createdRecord = result[0];

    return {
      success: true,
      message: "PM2.5 measurement created successfully",
      data: {
        id: createdRecord.id,
        latitude: parseFloat(createdRecord.latitude),
        longitude: parseFloat(createdRecord.longitude),
        pm25_value: parseFloat(createdRecord.pm25_value),
        measurement_date: createdRecord.measurement_date,
        created_at: createdRecord.created_at,
        ...validatedData,
      },
    };
  } catch (error) {
    console.error("Error creating PM2.5 measurement:", error);
    return {
      success: false,
      error: error.message || "Failed to create measurement record",
    };
  }
}
export async function POST(request) {
  return handler(await request.json());
}