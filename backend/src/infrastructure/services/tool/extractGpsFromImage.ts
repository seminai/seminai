import exifr from 'exifr';
import { FileService } from '../FileService';

export interface GpsExtractionResult {
  gpsFound: boolean;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  dateTaken: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  message: string;
}

/**
 * Extracts GPS coordinates and useful EXIF metadata from an image.
 *
 * @param fileUrl - Stable URL of the image file or file:// for testing
 * @returns Structured GPS and EXIF data
 */
export async function extractGpsFromImage(fileUrl: string): Promise<GpsExtractionResult> {
  const fileService = new FileService();
  const multerFile = await fileService.getFileFromUrl(fileUrl);

  if (!multerFile.buffer || multerFile.buffer.length === 0) {
    return {
      gpsFound: false,
      latitude: null,
      longitude: null,
      altitude: null,
      dateTaken: null,
      cameraMake: null,
      cameraModel: null,
      message: 'Il file scaricato è vuoto o non valido.',
    };
  }

  const mimetype = multerFile.mimetype?.toLowerCase() || '';

  if (mimetype === 'image/png') {
    return {
      gpsFound: false,
      latitude: null,
      longitude: null,
      altitude: null,
      dateTaken: null,
      cameraMake: null,
      cameraModel: null,
      message:
        'Le immagini PNG generalmente non contengono dati EXIF/GPS. ' +
        'Prova con un file JPEG o HEIC originale dalla fotocamera.',
    };
  }

  const exifData = await exifr.parse(multerFile.buffer, {
    pick: [
      'GPSLatitude',
      'GPSLongitude',
      'GPSAltitude',
      'GPSLatitudeRef',
      'GPSLongitudeRef',
      'GPSAltitudeRef',
      'DateTimeOriginal',
      'CreateDate',
      'Make',
      'Model',
    ],
    gps: true,
  });

  if (!exifData) {
    return {
      gpsFound: false,
      latitude: null,
      longitude: null,
      altitude: null,
      dateTaken: null,
      cameraMake: null,
      cameraModel: null,
      message:
        "Nessun dato EXIF trovato nell'immagine. " +
        "L'immagine potrebbe essere stata modificata, compressa o inviata tramite un'app di messaggistica che rimuove i metadati.",
    };
  }

  const latitude: number | null = exifData.latitude ?? null;
  const longitude: number | null = exifData.longitude ?? null;
  const altitude: number | null = exifData.GPSAltitude ?? null;
  const gpsFound = latitude !== null && longitude !== null;

  const dateTimeOriginal = exifData.DateTimeOriginal ?? exifData.CreateDate ?? null;
  const dateTaken =
    dateTimeOriginal instanceof Date
      ? dateTimeOriginal.toISOString()
      : dateTimeOriginal
        ? String(dateTimeOriginal)
        : null;

  const cameraMake: string | null = exifData.Make ?? null;
  const cameraModel: string | null = exifData.Model ?? null;

  let message: string;
  if (gpsFound) {
    message = `Coordinate GPS estratte: ${latitude!.toFixed(6)}, ${longitude!.toFixed(6)}`;
    if (altitude !== null) {
      message += ` (altitudine: ${altitude.toFixed(1)}m)`;
    }
    if (dateTaken) {
      message += `. Foto scattata il: ${dateTaken}`;
    }
  } else {
    message =
      'Dati EXIF trovati ma senza coordinate GPS. ' +
      'Il GPS potrebbe essere stato disabilitato al momento dello scatto.';
  }

  return {
    gpsFound,
    latitude,
    longitude,
    altitude,
    dateTaken,
    cameraMake,
    cameraModel,
    message,
  };
}
