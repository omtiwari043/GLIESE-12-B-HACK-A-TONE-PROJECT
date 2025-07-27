async function handler({
  id,
  latitude,
  longitude,
  pm25_value,
  aod_value,
  no2_value,
  temperature,
  humidity,
  wind_speed,
  data_source,
  is_prediction,
  model_version,
  prediction_accuracy,
  validation_status,
}) {
  try {
    if (!id) {
      return {
        success: false,
        error: "ID is required to update measurement",
      };
    }

    const measurementId = parseInt(id);
    if (isNaN(measurementId)) {
      return {
        success: false,
        error: "Invalid ID provided",
      };
    }

    const existingRecord = await sql(
      "SELECT * FROM pm25_measurements WHERE id = $1",
      [measurementId]
    );

    if (existingRecord.length === 0) {
      return {
        success: false,
        error: "Measurement record not found",
      };
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (latitude !== undefined && latitude !== null) {
      const lat = parseFloat(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return {
          success: false,
          error: "Latitude must be between -90 and 90",
        };
      }
      updateFields.push(`latitude = $${paramIndex}`);
      updateValues.push(lat);
      paramIndex++;
    }

    if (longitude !== undefined && longitude !== null) {
      const lng = parseFloat(longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        return {
          success: false,
          error: "Longitude must be between -180 and 180",
        };
      }
      updateFields.push(`longitude = $${paramIndex}`);
      updateValues.push(lng);
      paramIndex++;
    }

    if (pm25_value !== undefined && pm25_value !== null) {
      const pm25 = parseFloat(pm25_value);
      if (isNaN(pm25) || pm25 < 0 || pm25 > 500) {
        return {
          success: false,
          error: "PM2.5 value must be between 0 and 500 μg/m³",
        };
      }
      updateFields.push(`pm25_value = $${paramIndex}`);
      updateValues.push(pm25);
      paramIndex++;
    }

    if (aod_value !== undefined && aod_value !== null) {
      const aod = parseFloat(aod_value);
      if (isNaN(aod) || aod < 0 || aod > 5) {
        return {
          success: false,
          error: "AOD value must be between 0 and 5",
        };
      }
      updateFields.push(`aod_value = $${paramIndex}`);
      updateValues.push(aod);
      paramIndex++;
    }

    if (no2_value !== undefined && no2_value !== null) {
      const no2 = parseFloat(no2_value);
      if (isNaN(no2) || no2 < 0) {
        return {
          success: false,
          error: "NO2 value must be non-negative",
        };
      }
      updateFields.push(`no2_value = $${paramIndex}`);
      updateValues.push(no2);
      paramIndex++;
    }

    if (temperature !== undefined && temperature !== null) {
      const temp = parseFloat(temperature);
      if (isNaN(temp) || temp < -50 || temp > 60) {
        return {
          success: false,
          error: "Temperature must be between -50°C and 60°C",
        };
      }
      updateFields.push(`temperature = $${paramIndex}`);
      updateValues.push(temp);
      paramIndex++;
    }

    if (humidity !== undefined && humidity !== null) {
      const hum = parseFloat(humidity);
      if (isNaN(hum) || hum < 0 || hum > 100) {
        return {
          success: false,
          error: "Humidity must be between 0% and 100%",
        };
      }
      updateFields.push(`humidity = $${paramIndex}`);
      updateValues.push(hum);
      paramIndex++;
    }

    if (wind_speed !== undefined && wind_speed !== null) {
      const wind = parseFloat(wind_speed);
      if (isNaN(wind) || wind < 0 || wind > 50) {
        return {
          success: false,
          error: "Wind speed must be between 0 and 50 m/s",
        };
      }
      updateFields.push(`wind_speed = $${paramIndex}`);
      updateValues.push(wind);
      paramIndex++;
    }

    if (data_source !== undefined && data_source !== null) {
      updateFields.push(`data_source = $${paramIndex}`);
      updateValues.push(String(data_source));
      paramIndex++;
    }

    if (is_prediction !== undefined && is_prediction !== null) {
      updateFields.push(`is_prediction = $${paramIndex}`);
      updateValues.push(Boolean(is_prediction));
      paramIndex++;
    }

    if (model_version !== undefined && model_version !== null) {
      updateFields.push(`model_version = $${paramIndex}`);
      updateValues.push(String(model_version));
      paramIndex++;
    }

    if (prediction_accuracy !== undefined && prediction_accuracy !== null) {
      const accuracy = parseFloat(prediction_accuracy);
      if (isNaN(accuracy) || accuracy < 0 || accuracy > 1) {
        return {
          success: false,
          error: "Prediction accuracy must be between 0 and 1",
        };
      }
      updateFields.push(`prediction_accuracy = $${paramIndex}`);
      updateValues.push(accuracy);
      paramIndex++;
    }

    if (validation_status !== undefined && validation_status !== null) {
      updateFields.push(`validation_status = $${paramIndex}`);
      updateValues.push(String(validation_status));
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return {
        success: false,
        error: "No valid fields provided for update",
      };
    }

    const updateQuery = `
      UPDATE pm25_measurements 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    updateValues.push(measurementId);

    const result = await sql(updateQuery, updateValues);

    if (result.length === 0) {
      return {
        success: false,
        error: "Failed to update measurement record",
      };
    }

    const updatedRecord = result[0];

    return {
      success: true,
      message: "PM2.5 measurement updated successfully",
      data: {
        id: updatedRecord.id,
        latitude: parseFloat(updatedRecord.latitude),
        longitude: parseFloat(updatedRecord.longitude),
        pm25_value: updatedRecord.pm25_value
          ? parseFloat(updatedRecord.pm25_value)
          : null,
        aod_value: updatedRecord.aod_value
          ? parseFloat(updatedRecord.aod_value)
          : null,
        no2_value: updatedRecord.no2_value
          ? parseFloat(updatedRecord.no2_value)
          : null,
        temperature: updatedRecord.temperature
          ? parseFloat(updatedRecord.temperature)
          : null,
        humidity: updatedRecord.humidity
          ? parseFloat(updatedRecord.humidity)
          : null,
        wind_speed: updatedRecord.wind_speed
          ? parseFloat(updatedRecord.wind_speed)
          : null,
        data_source: updatedRecord.data_source,
        is_prediction: updatedRecord.is_prediction,
        model_version: updatedRecord.model_version,
        prediction_accuracy: updatedRecord.prediction_accuracy
          ? parseFloat(updatedRecord.prediction_accuracy)
          : null,
        validation_status: updatedRecord.validation_status,
        measurement_date: updatedRecord.measurement_date,
        created_at: updatedRecord.created_at,
      },
      updated_fields: updateFields.length,
    };
  } catch (error) {
    console.error("Error updating PM2.5 measurement:", error);
    return {
      success: false,
      error: error.message || "Failed to update measurement record",
    };
  }
}
export async function POST(request) {
  return handler(await request.json());
}