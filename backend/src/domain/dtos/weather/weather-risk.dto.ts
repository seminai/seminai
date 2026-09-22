export type WeatherRiskKind = 'rain' | 'wind' | 'frost' | 'heat' | 'humidity';
export type WeatherRiskSeverity = 'low' | 'medium' | 'high';

/**
 * A single weather-driven risk for a planned treatment, with the time it
 * applies to and a short message suitable for the agent or end user.
 */
export interface WeatherRiskDto {
  readonly kind: WeatherRiskKind;
  readonly severity: WeatherRiskSeverity;
  readonly when: string;
  readonly message: string;
}
