import { COLUMN_NAME_MAPPINGS } from './header_detector.part-01-header-indicators';

/**
 * Normalize header names to match template format
 */
export function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h, index) => {
    const normalized = h.toLowerCase().trim().replace(/\s+/g, ' ');

    // Check direct mapping ONLY for exact matches
    if (COLUMN_NAME_MAPPINGS[normalized]) {
      return COLUMN_NAME_MAPPINGS[normalized];
    }

    // Handle Piemonte format specific combinations FIRST
    // These are more specific and should take precedence over partial matches
    // "Uso del suolo primario Occ. suolo" -> "Occupazione Suolo Uso Suolo Primario"
    const lower = h.toLowerCase();

    // Check for "uso del suolo primario" combined with sub-headers
    if (lower.includes('uso del suolo primario') || lower.includes('suolo primario')) {
      if (lower.includes('occ.') || lower.includes('occ ')) {
        return 'Occupazione Suolo Uso Suolo Primario';
      }
      if (lower.includes('destinazione')) {
        return 'Destinazione Uso Suolo Primario';
      }
      if (lower.includes('qualita')) {
        return 'Qualita Uso Suolo Primario';
      }
      if (lower.includes('varieta')) {
        return 'Varieta Uso Suolo Primario';
      }
      if (lower.includes('netta')) {
        return 'Superficie Netta Uso Suolo Primario';
      }
      if (lower.includes('sup.') || lower.includes('superficie')) {
        return 'Superficie Uso Suolo Primario';
      }
    }

    // Check for "uso del suolo secondario" combined with sub-headers
    if (lower.includes('uso del suolo secondario') || lower.includes('suolo secondario')) {
      if (lower.includes('occ.') || lower.includes('occ ')) {
        return 'Occupazione suolo Uso Suolo Secondario';
      }
      if (lower.includes('destinazione')) {
        return 'Destinazione Uso Suolo Secondario';
      }
      if (lower.includes('qualita')) {
        return 'Qualita Uso Suolo Secondario';
      }
      if (lower.includes('varieta')) {
        return 'Varieta Uso Suolo Secondario';
      }
      if (lower.includes('netta')) {
        return 'Sup Netta Uso Suolo Secondario';
      }
      if (lower.includes('sup.') || lower.includes('superficie')) {
        return 'Sup Uso Suolo Secondario';
      }
    }

    // Check for "semina primario" combined with sub-headers
    if (lower.includes('semina primario')) {
      if (lower.includes('epoca')) {
        return 'Epoca Semina Primario';
      }
      if (lower.includes('tipo')) {
        return 'Tipo Semina Primario';
      }
      if (lower.includes('data inizio') || lower.includes('inizio')) {
        return 'Data inizio Semina Primario';
      }
      if (lower.includes('data fine') || lower.includes('fine')) {
        return 'Data fine Semina Primario';
      }
    }

    // Check for "semina secondario" combined with sub-headers
    if (lower.includes('semina secondario')) {
      if (lower.includes('epoca')) {
        return 'Epoca Semina Secondario';
      }
      if (lower.includes('tipo')) {
        return 'Tipo Semina Secondario';
      }
      if (lower.includes('data inizio') || lower.includes('inizio')) {
        return 'Data inizio Semina Secondario';
      }
      if (lower.includes('data fine') || lower.includes('fine')) {
        return 'Data fine Semina Secondario';
      }
    }

    // Build compound name for multi-part headers
    const parts = h.split(' ').filter((p) => p.trim());
    if (parts.length > 1) {
      const lowerParts = parts.map((p) => p.toLowerCase());

      if (lowerParts.includes('primario') || lower.includes('primario')) {
        if (
          lowerParts.includes('occ.') ||
          lowerParts.includes('occupazione') ||
          lower.includes('occ. suolo')
        ) {
          return 'Occupazione Suolo Uso Suolo Primario';
        }
        if (lowerParts.includes('destinazione')) {
          return 'Destinazione Uso Suolo Primario';
        }
        if (lowerParts.includes('uso') && !lower.includes('uso del suolo')) {
          return 'Uso Uso Suolo Primario';
        }
        if (lowerParts.includes('qualita') || lower.includes("qualita'")) {
          return 'Qualita Uso Suolo Primario';
        }
        if (lowerParts.includes('varieta') || lower.includes("varieta'")) {
          return 'Varieta Uso Suolo Primario';
        }
        if (
          lowerParts.includes('sup.') ||
          (lowerParts.includes('superficie') && !lower.includes('netta'))
        ) {
          return 'Superficie Uso Suolo Primario';
        }
        if (lower.includes('netta')) {
          return 'Superficie Netta Uso Suolo Primario';
        }
        if (lowerParts.includes('epoca')) {
          return 'Epoca Semina Primario';
        }
        if (lowerParts.includes('tipo')) {
          return 'Tipo Semina Primario';
        }
        if (lower.includes('data inizio')) {
          return 'Data inizio Semina Primario';
        }
        if (lower.includes('data fine')) {
          return 'Data fine Semina Primario';
        }
      }

      if (lowerParts.includes('secondario') || lower.includes('secondario')) {
        if (
          lowerParts.includes('occ.') ||
          lowerParts.includes('occupazione') ||
          lower.includes('occ. suolo')
        ) {
          return 'Occupazione suolo Uso Suolo Secondario';
        }
        if (lowerParts.includes('destinazione')) {
          return 'Destinazione Uso Suolo Secondario';
        }
        if (lowerParts.includes('uso') && !lower.includes('uso del suolo')) {
          return 'Uso Uso Suolo Secondario';
        }
        if (lowerParts.includes('qualita') || lower.includes("qualita'")) {
          return 'Qualita Uso Suolo Secondario';
        }
        if (lowerParts.includes('varieta') || lower.includes("varieta'")) {
          return 'Varieta Uso Suolo Secondario';
        }
        if (
          lowerParts.includes('sup.') ||
          (lowerParts.includes('superficie') && !lower.includes('netta'))
        ) {
          return 'Sup Uso Suolo Secondario';
        }
        if (lower.includes('netta')) {
          return 'Sup Netta Uso Suolo Secondario';
        }
        if (lowerParts.includes('epoca')) {
          return 'Epoca Semina Secondario';
        }
        if (lowerParts.includes('tipo')) {
          return 'Tipo Semina Secondario';
        }
        if (lower.includes('data inizio')) {
          return 'Data inizio Semina Secondario';
        }
        if (lower.includes('data fine')) {
          return 'Data fine Semina Secondario';
        }
      }
    }

    // Return original if no mapping found, with cleanup
    return h.replace(/\r?\n/g, ' ').trim() || `Column_${index}`;
  });
}
