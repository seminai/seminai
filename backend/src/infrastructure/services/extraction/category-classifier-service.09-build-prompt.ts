import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type FileFormat } from './file-format-resolver';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export function categoryClassifierServiceBuildPrompt(this: CategoryClassifierServiceContext, input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): string {
    const preview = this.buildPreview(input.fileFormat, input.pdfText);
    return `You classify business documents for extraction routing.
Return ONLY JSON with this shape:
{"category":"fields|production_units|agricultural|invoice|ddt|stock","confidence":0.0,"reason":"short explanation"}

Rules:
- Prefer lowest-latency conservative routing.
- If uncertain between fields/production_units, return agricultural.
- XML and images should usually be invoice.
- DDT requires transport-document clues.

Input:
- fileName: ${input.fileName}
- mimeType: ${input.mimeType}
- fileFormat: ${input.fileFormat}
- ruleDetectionType: ${input.detection?.type ?? 'none'}
- ruleDetectionConfidence: ${input.detection?.confidence ?? 'none'}
- ruleDetectionReason: ${input.detection?.reason ?? 'none'}
- contentPreview: ${preview}`;
  }
