import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { ExtractDataFromDdtService } from '../../services/tool/extractDataFromDDT';
import { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import { productRegistrationLookupServiceSingleton } from '../../services/utils/ProductRegistrationLookupServiceSingleton';
import { LlmProductCategoryClassifier } from '../../services/tool/llm-product-category-classifier';
import { parseProductName, resolveOfficialName, isPiecesUnit, convertPiecesToRealUnit } from '../../services/utils/ProductNameParser';
import { convertQuantityToCanonicalUnit } from '../../utils/quantityConversion';
import { resolveOcrProvider } from '../../services/ocr/ocr-provider';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ProductControllerContext } from './product-controller.context';
import { resolveExtractedCategory } from './product-controller.helpers';

export async function productControllerBulkFromDdtToProductList(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const files = request.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw AppError.badRequest('No files provided', 'NO_FILES');
    }

    const MAX_FILES = 10;
    if (files.length > MAX_FILES) {
      throw AppError.badRequest(
        `Too many files. Maximum ${MAX_FILES} files allowed per request`,
        'TOO_MANY_FILES',
      );
    }

    const tempFiles: string[] = [];
    const allEntries: DdtEntry[] = [];
    const DDT_CONCURRENCY = 3;
    const ocrProvider = resolveOcrProvider(request.body?.ocrProvider);

    try {
      const service = new ExtractDataFromDdtService();

      // Write all temp files upfront before parallel processing
      const fileInfos = files.map((file) => {
        const tempFilePath = path.join(os.tmpdir(), `ddt_${Date.now()}_${file.originalname}`);
        fs.writeFileSync(tempFilePath, file.buffer as unknown as Uint8Array);
        tempFiles.push(tempFilePath);
        return { file, tempFilePath };
      });

      // Process in batches with controlled concurrency
      for (let i = 0; i < fileInfos.length; i += DDT_CONCURRENCY) {
        const batch = fileInfos.slice(i, i + DDT_CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async ({ file, tempFilePath }) => {
            console.log(`[DDT_BULK] Processing file: ${file.originalname} (${file.size} bytes)`);
            const result = await service.execute({ pdfPath: tempFilePath, ocrProvider });
            console.log(
              `[DDT_BULK] Extracted ${result.entries.length} entries from ${file.originalname}`,
            );
            if (result.rawTextPath && fs.existsSync(result.rawTextPath)) {
              fs.rmSync(result.rawTextPath);
            }
            return result.entries;
          }),
        );
        for (const settled of batchResults) {
          if (settled.status === 'fulfilled') {
            allEntries.push(...settled.value);
          } else {
            console.error(`[DDT_BULK] File extraction failed:`, settled.reason);
          }
        }
      }

      console.log(`[DDT_BULK] Total entries collected: ${allEntries.length}`);
      if (allEntries.length === 0) {
        console.warn(
          `[DDT_BULK] No entries extracted from ${files.length} file(s). This might indicate an issue with the PDF format or extraction process.`,
        );
      }
      const llmCategoryClassifier = new LlmProductCategoryClassifier();
      const ddtOtherNames = allEntries
        .filter((entry) => entry.productCategory === 'OTHER' && !entry.registrationNumber)
        .map((entry) => entry.productName);
      const ddtLlmCategoryByName = await llmCategoryClassifier.classifyProductNames({
        productNames: ddtOtherNames,
      });

      const suggestedProducts = allEntries.map((entry) => {
        const parsed = parseProductName(entry.productName);
        const normalizedName = resolveOfficialName(parsed.baseName);
        const resolvedCategory = resolveExtractedCategory({
          entryCategory: entry.productCategory,
          registrationNumber: entry.registrationNumber,
          productName: entry.productName,
          llmCategoryByName: ddtLlmCategoryByName,
        });

        let effectiveQuantity = entry.quantity;
        let effectiveUnit = entry.quantityUnitOfMeasure;

        if (effectiveQuantity !== null && effectiveUnit && isPiecesUnit(effectiveUnit)) {
          const piecesConversion = convertPiecesToRealUnit(
            effectiveQuantity,
            effectiveUnit,
            entry.productName,
          );
          if (piecesConversion.converted) {
            effectiveQuantity = piecesConversion.quantity;
            effectiveUnit = piecesConversion.unitOfMeasure;
          }
        }

        const conversion = convertQuantityToCanonicalUnit(effectiveQuantity, effectiveUnit);
        const product = {
          productName: normalizedName,
          productNameExtracted: entry.productName.trim(),
          registrationNumber: entry.registrationNumber,
          administrativeStatus: null as string | null,
          productCategory: resolvedCategory,
          quantity: entry.quantity,
          quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
          quantityConverted: conversion?.quantityConverted ?? entry.quantity,
          unitMeasureConverted: conversion?.unitMeasureConverted ?? entry.quantityUnitOfMeasure,
          quantityExtractedInProductName: parsed.packagingQuantity,
          quantityExtractedInProductNameUnit: parsed.packagingUnit,
          supplierName: entry.supplierName,
          supplierVat: entry.supplierVat,
          ddtDate: entry.ddtDate,
          orderNumber: entry.orderNumber,
        };
        console.log(`[DDT_BULK] Mapped entry: ${JSON.stringify(product)}`);
        return product;
      });

      console.log(`[DDT_BULK] Mapped ${suggestedProducts.length} products before enrichment`);
      const enrichedProducts =
        productRegistrationLookupServiceSingleton.enrichProductsWithRegistration(suggestedProducts);
      console.log(`[DDT_BULK] After enrichment: ${enrichedProducts.length} products`);

      const responseData = {
        status: 'success' as const,
        data: { suggestedProducts: enrichedProducts, totalEntries: allEntries.length },
      };
      console.log(
        `[DDT_BULK] Returning response with ${enrichedProducts.length} products and ${allEntries.length} total entries`,
      );
      console.log(
        `[DDT_BULK] Response data preview: ${JSON.stringify(responseData).substring(0, 500)}`,
      );
      const jsonResponse = response.status(200).json(responseData);
      console.log(`[DDT_BULK] Response sent successfully`);
      return jsonResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error during DDT extraction';
      console.error(`[DDT_BULK] Extraction error: ${message}`, error);
      throw AppError.internal(message, 'DDT_EXTRACTION_ERROR');
    } finally {
      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          fs.rmSync(tempFile);
        }
      }
    }
  }
