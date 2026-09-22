import { createCanvas, loadImage } from 'canvas';

interface ExtractedColors {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

interface ColorFrequency {
  r: number;
  g: number;
  b: number;
  frequency: number;
}

/**
 * Servizio per estrarre i colori principali da un'immagine
 */
export class ColorExtractionService {
  /**
   * Estrae i colori principali da un buffer di immagine
   * @param imageBuffer Buffer dell'immagine
   * @returns Colori estratti in formato hex
   */
  async extractColors(imageBuffer: Buffer): Promise<ExtractedColors> {
    try {
      // Carica l'immagine dal buffer usando canvas
      const img = await loadImage(imageBuffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Ottieni i dati dell'immagine
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      // Raggruppa i colori simili e conta le frequenze
      const colorMap = new Map<string, ColorFrequency>();
      const step = 4; // Salta ogni pixel per performance (ogni pixel è 4 bytes: RGBA)

      for (let i = 0; i < data.length; i += step * 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Ignora pixel trasparenti
        if (a < 128) continue;

        // Quantizza i colori per raggruppare colori simili
        const quantizedR = Math.floor(r / 16) * 16;
        const quantizedG = Math.floor(g / 16) * 16;
        const quantizedB = Math.floor(b / 16) * 16;
        const key = `${quantizedR},${quantizedG},${quantizedB}`;

        if (colorMap.has(key)) {
          const existing = colorMap.get(key)!;
          existing.frequency++;
        } else {
          colorMap.set(key, { r: quantizedR, g: quantizedG, b: quantizedB, frequency: 1 });
        }
      }

      // Ordina i colori per frequenza e prendi i primi 5
      const sortedColors = Array.from(colorMap.values())
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 5);

      if (sortedColors.length === 0) {
        return this.getDefaultColors();
      }

      // Converti i colori in hex
      const colors = sortedColors.map((color) => this.rgbToHex(color.r, color.g, color.b));

      // Seleziona i colori: il primo è primary, il secondo secondary, il terzo accent
      const primaryColor = colors[0] || '#2563eb';
      const secondaryColor = colors[1] || colors[0] || '#1e40af';
      const accentColor = colors[2] || colors[1] || colors[0] || '#3b82f6';

      return {
        primaryColor,
        secondaryColor,
        accentColor,
      };
    } catch (error) {
      console.error('Error extracting colors from image:', error);
      // In caso di errore, ritorna i colori di default
      return this.getDefaultColors();
    }
  }

  /**
   * Converte RGB in formato hex
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }

  /**
   * Ritorna i colori di default
   */
  private getDefaultColors(): ExtractedColors {
    return {
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      accentColor: '#3b82f6',
    };
  }
}
