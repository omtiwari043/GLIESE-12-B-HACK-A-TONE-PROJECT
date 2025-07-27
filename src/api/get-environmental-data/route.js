async function handler({
  latitude,
  longitude,
  radius = 100,
  date,
  includeHistorical = true,
  fallbackToEstimates = true,
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

    const targetDate = date ? new Date(date) : new Date();
    const currentMonth = targetDate.getMonth() + 1;
    const currentSeason = Math.floor((currentMonth - 1) / 3) + 1;

    let queryConditions = [];
    let queryParams = [lat, lng];
    let paramIndex = 3;

    const degreeRadius = searchRadius / 111.32;
    queryConditions.push(`
      latitude BETWEEN $${paramIndex} AND $${paramIndex + 1}
      AND longitude BETWEEN $${paramIndex + 2} AND $${paramIndex + 3}
    `);
    queryParams.push(
      lat - degreeRadius,
      lat + degreeRadius,
      lng - degreeRadius,
      lng + degreeRadius
    );
    paramIndex += 4;

    if (includeHistorical) {
      const monthStart = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth(),
        1
      );
      const monthEnd = new Date(
        targetDate.getFullYear(),
        targetDate.getMonth() + 1,
        0
      );
      queryConditions.push(
        `measurement_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`
      );
      queryParams.push(monthStart, monthEnd);
      paramIndex += 2;
    } else {
      const dayStart = new Date(targetDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(targetDate);
      dayEnd.setHours(23, 59, 59, 999);
      queryConditions.push(
        `measurement_date BETWEEN $${paramIndex} AND $${paramIndex + 1}`
      );
      queryParams.push(dayStart, dayEnd);
      paramIndex += 2;
    }

    const environmentalQuery = `
      SELECT 
        latitude, longitude, aod_value, no2_value, temperature, 
        humidity, wind_speed, measurement_date, data_source,
        SQRT(
          POW((latitude - $1), 2) + 
          POW((longitude - $2), 2)
        ) * 111.32 as distance_km
      FROM pm25_measurements 
      WHERE ${queryConditions.join(" AND ")}
        AND (
          aod_value IS NOT NULL 
          OR no2_value IS NOT NULL 
          OR temperature IS NOT NULL 
          OR humidity IS NOT NULL 
          OR wind_speed IS NOT NULL
        )
      ORDER BY distance_km ASC, measurement_date DESC
      LIMIT 200
    `;

    const measurements = await sql(environmentalQuery, queryParams);

    const validMeasurements = measurements.filter(
      (m) => parseFloat(m.distance_km) <= searchRadius
    );

    let environmentalData = {
      aod_value: null,
      no2_value: null,
      temperature: null,
      humidity: null,
      wind_speed: null,
    };

    let dataQuality = {
      aod_sources: 0,
      no2_sources: 0,
      temperature_sources: 0,
      humidity_sources: 0,
      wind_speed_sources: 0,
    };

    if (validMeasurements.length > 0) {
      const calculateWeightedAverage = (parameter) => {
        const validValues = validMeasurements
          .filter((m) => m[parameter] !== null && m[parameter] !== undefined)
          .map((m) => ({
            value: parseFloat(m[parameter]),
            weight: 1 / (parseFloat(m.distance_km) + 1),
            date: new Date(m.measurement_date),
          }));

        if (validValues.length === 0) return null;

        dataQuality[`${parameter}_sources`] = validValues.length;

        const totalWeight = validValues.reduce(
          (sum, item) => sum + item.weight,
          0
        );
        const weightedSum = validValues.reduce(
          (sum, item) => sum + item.value * item.weight,
          0
        );

        return Math.round((weightedSum / totalWeight) * 1000000) / 1000000;
      };

      environmentalData.aod_value = calculateWeightedAverage("aod_value");
      environmentalData.no2_value = calculateWeightedAverage("no2_value");
      environmentalData.temperature = calculateWeightedAverage("temperature");
      environmentalData.humidity = calculateWeightedAverage("humidity");
      environmentalData.wind_speed = calculateWeightedAverage("wind_speed");
    }

    if (fallbackToEstimates) {
      if (environmentalData.aod_value === null) {
        const baseAOD = 0.15;
        const latitudeEffect = Math.abs(lat) * 0.002;
        const seasonalEffect =
          Math.sin((currentMonth / 12) * 2 * Math.PI) * 0.05;
        environmentalData.aod_value = Math.max(
          0.05,
          Math.min(
            1.0,
            baseAOD +
              latitudeEffect +
              seasonalEffect +
              (Math.random() - 0.5) * 0.1
          )
        );
        environmentalData.aod_value =
          Math.round(environmentalData.aod_value * 1000000) / 1000000;
      }

      if (environmentalData.no2_value === null) {
        const baseNO2 = 0.000025;
        const urbanEffect = Math.min(0.00005, Math.abs(lat - 40.7) * 0.000001);
        const seasonalEffect =
          Math.sin(((currentMonth + 3) / 12) * 2 * Math.PI) * 0.00001;
        environmentalData.no2_value = Math.max(
          0.000005,
          Math.min(
            0.0001,
            baseNO2 +
              urbanEffect +
              seasonalEffect +
              (Math.random() - 0.5) * 0.000005
          )
        );
        environmentalData.no2_value =
          Math.round(environmentalData.no2_value * 1000000000) / 1000000000;
      }

      if (environmentalData.temperature === null) {
        const baseTemp = 15;
        const latitudeEffect = (90 - Math.abs(lat)) * 0.3;
        const seasonalEffect =
          Math.sin(((currentMonth - 1) / 12) * 2 * Math.PI) * 15;
        const hemisphereAdjustment = lat < 0 ? -seasonalEffect : seasonalEffect;
        environmentalData.temperature = Math.max(
          -30,
          Math.min(
            45,
            baseTemp +
              latitudeEffect +
              hemisphereAdjustment +
              (Math.random() - 0.5) * 5
          )
        );
        environmentalData.temperature =
          Math.round(environmentalData.temperature * 10) / 10;
      }

      if (environmentalData.humidity === null) {
        const baseHumidity = 60;
        const coastalEffect = Math.max(0, 20 - Math.abs(lng + 95) * 0.2);
        const seasonalEffect =
          Math.sin(((currentMonth + 6) / 12) * 2 * Math.PI) * 10;
        environmentalData.humidity = Math.max(
          20,
          Math.min(
            90,
            baseHumidity +
              coastalEffect +
              seasonalEffect +
              (Math.random() - 0.5) * 15
          )
        );
        environmentalData.humidity =
          Math.round(environmentalData.humidity * 10) / 10;
      }

      if (environmentalData.wind_speed === null) {
        const baseWindSpeed = 4;
        const coastalEffect = Math.max(0, 15 - Math.abs(lng + 80) * 0.1);
        const latitudeEffect = Math.abs(lat) * 0.05;
        const seasonalEffect =
          Math.sin(((currentMonth + 9) / 12) * 2 * Math.PI) * 2;
        environmentalData.wind_speed = Math.max(
          0.5,
          Math.min(
            15,
            baseWindSpeed +
              coastalEffect +
              latitudeEffect +
              seasonalEffect +
              (Math.random() - 0.5) * 2
          )
        );
        environmentalData.wind_speed =
          Math.round(environmentalData.wind_speed * 10) / 10;
      }
    }

    const statistics = {
      total_measurements: validMeasurements.length,
      search_radius_km: searchRadius,
      avg_distance:
        validMeasurements.length > 0
          ? Math.round(
              (validMeasurements.reduce(
                (sum, m) => sum + parseFloat(m.distance_km),
                0
              ) /
                validMeasurements.length) *
                100
            ) / 100
          : 0,
      data_sources: [...new Set(validMeasurements.map((m) => m.data_source))],
      time_range: {
        earliest:
          validMeasurements.length > 0
            ? new Date(
                Math.min(
                  ...validMeasurements.map((m) =>
                    new Date(m.measurement_date).getTime()
                  )
                )
              ).toISOString()
            : null,
        latest:
          validMeasurements.length > 0
            ? new Date(
                Math.max(
                  ...validMeasurements.map((m) =>
                    new Date(m.measurement_date).getTime()
                  )
                )
              ).toISOString()
            : null,
      },
    };

    return {
      success: true,
      location: {
        latitude: lat,
        longitude: lng,
        date: targetDate.toISOString(),
        season: currentSeason,
        month: currentMonth,
      },
      environmental_data: environmentalData,
      data_quality: dataQuality,
      statistics: statistics,
      estimation_methods: {
        aod_value:
          dataQuality.aod_sources > 0
            ? "measured_data"
            : "geographic_seasonal_model",
        no2_value:
          dataQuality.no2_sources > 0
            ? "measured_data"
            : "urban_proximity_model",
        temperature:
          dataQuality.temperature_sources > 0
            ? "measured_data"
            : "latitude_seasonal_model",
        humidity:
          dataQuality.humidity_sources > 0
            ? "measured_data"
            : "coastal_seasonal_model",
        wind_speed:
          dataQuality.wind_speed_sources > 0
            ? "measured_data"
            : "geographic_climate_model",
      },
    };
  } catch (error) {
    console.error("Environmental data fetch error:", error);
    return {
      success: false,
      error: error.message,
      details: "Failed to retrieve environmental data",
    };
  }
}
export async function POST(request) {
  return handler(await request.json());
}