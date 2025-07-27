async function handler({
  model_name,
  rmse,
  r_squared,
  mae,
  validation_score,
  training_samples,
  feature_importance,
}) {
  try {
    if (!model_name) {
      return {
        success: false,
        error: "model_name is required",
      };
    }

    const validatedData = {
      model_name: String(model_name),
    };

    if (rmse !== undefined && rmse !== null) {
      const rmseValue = parseFloat(rmse);
      if (isNaN(rmseValue) || rmseValue < 0) {
        return {
          success: false,
          error: "RMSE must be a non-negative number",
        };
      }
      validatedData.rmse = rmseValue;
    }

    if (r_squared !== undefined && r_squared !== null) {
      const r2Value = parseFloat(r_squared);
      if (isNaN(r2Value) || r2Value < 0 || r2Value > 1) {
        return {
          success: false,
          error: "R-squared must be between 0 and 1",
        };
      }
      validatedData.r_squared = r2Value;
    }

    if (mae !== undefined && mae !== null) {
      const maeValue = parseFloat(mae);
      if (isNaN(maeValue) || maeValue < 0) {
        return {
          success: false,
          error: "MAE must be a non-negative number",
        };
      }
      validatedData.mae = maeValue;
    }

    if (validation_score !== undefined && validation_score !== null) {
      const validationValue = parseFloat(validation_score);
      if (
        isNaN(validationValue) ||
        validationValue < 0 ||
        validationValue > 1
      ) {
        return {
          success: false,
          error: "Validation score must be between 0 and 1",
        };
      }
      validatedData.validation_score = validationValue;
    }

    if (training_samples !== undefined && training_samples !== null) {
      const samplesValue = parseInt(training_samples);
      if (isNaN(samplesValue) || samplesValue < 1) {
        return {
          success: false,
          error: "Training samples must be a positive integer",
        };
      }
      validatedData.training_samples = samplesValue;
    }

    if (feature_importance !== undefined && feature_importance !== null) {
      try {
        const featureData =
          typeof feature_importance === "string"
            ? JSON.parse(feature_importance)
            : feature_importance;

        if (typeof featureData !== "object" || Array.isArray(featureData)) {
          return {
            success: false,
            error: "Feature importance must be a JSON object",
          };
        }
        validatedData.feature_importance = featureData;
      } catch (parseError) {
        return {
          success: false,
          error: "Invalid JSON format for feature_importance",
        };
      }
    }

    const columns = Object.keys(validatedData);
    const values = Object.values(validatedData);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const columnNames = columns.join(", ");

    const query = `
      INSERT INTO model_metrics (${columnNames})
      VALUES (${placeholders})
      RETURNING id, model_name, rmse, r_squared, mae, validation_score, 
                training_samples, feature_importance, created_at
    `;

    const result = await sql(query, values);

    if (result.length === 0) {
      return {
        success: false,
        error: "Failed to create model metrics record",
      };
    }

    const createdRecord = result[0];

    return {
      success: true,
      message: "Model metrics record created successfully",
      data: {
        id: createdRecord.id,
        model_name: createdRecord.model_name,
        rmse: createdRecord.rmse ? parseFloat(createdRecord.rmse) : null,
        r_squared: createdRecord.r_squared
          ? parseFloat(createdRecord.r_squared)
          : null,
        mae: createdRecord.mae ? parseFloat(createdRecord.mae) : null,
        validation_score: createdRecord.validation_score
          ? parseFloat(createdRecord.validation_score)
          : null,
        training_samples: createdRecord.training_samples,
        feature_importance: createdRecord.feature_importance,
        created_at: createdRecord.created_at,
      },
    };
  } catch (error) {
    console.error("Error creating model metrics:", error);
    return {
      success: false,
      error: error.message || "Failed to create model metrics record",
    };
  }
}
export async function POST(request) {
  return handler(await request.json());
}