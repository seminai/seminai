/**
 * Service for performing keyword search on text content.
 * Uses a combination of exact text matching and fuzzy matching
 * to validate if keywords are present in fetched content.
 */

import type { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createEmbeddings } from '../../../llm-embeddings-factory';
import {
  type KeywordSearchResult,
  type ValidationConfig,
  DEFAULT_VALIDATION_CONFIG,
} from './types';

/**
 * Service for performing keyword search in text content.
 * Uses text-based matching with optional semantic similarity via embeddings.
 */
export class InMemoryVectorSearchService {
  private readonly embeddings: OpenAIEmbeddings;
  private readonly textSplitter: RecursiveCharacterTextSplitter;
  private readonly config: Required<ValidationConfig>;

  constructor(config?: Partial<ValidationConfig>) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };

    this.embeddings = createEmbeddings().embeddings;

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ', ', ' ', ''],
    });
  }

  /**
   * Searches for keywords in the given text using text matching and optional semantic similarity.
   *
   * @param text - The text content to search in
   * @param keywords - Keywords to search for
   * @returns Search result with matched keywords and relevant snippets
   */
  async searchKeywords(text: string, keywords: string[]): Promise<KeywordSearchResult> {
    if (!text || text.trim().length === 0 || keywords.length === 0) {
      return {
        matchedKeywords: [],
        totalKeywords: keywords.length,
        relevantSnippets: [],
      };
    }

    try {
      // Split text into chunks for better snippet extraction
      const chunks = await this.textSplitter.splitText(text);

      if (chunks.length === 0) {
        return {
          matchedKeywords: [],
          totalKeywords: keywords.length,
          relevantSnippets: [],
        };
      }

      const matchedKeywords: string[] = [];
      const relevantSnippets: string[] = [];

      // First, try text-based matching (fast and reliable)
      for (const keyword of keywords) {
        if (this.textContainsKeyword(text, keyword)) {
          matchedKeywords.push(keyword);
          const snippet = this.extractTextSnippet(text, keyword);
          if (snippet && !relevantSnippets.includes(snippet)) {
            relevantSnippets.push(snippet);
          }
        }
      }

      // If we found some matches via text search, also try semantic search for remaining keywords
      const unmatchedKeywords = keywords.filter((k) => !matchedKeywords.includes(k));

      if (unmatchedKeywords.length > 0 && this.config.similarityThreshold < 1.0) {
        try {
          // Use embeddings to find semantically similar content
          const semanticMatches = await this.findSemanticMatches(chunks, unmatchedKeywords);

          for (const match of semanticMatches) {
            if (!matchedKeywords.includes(match.keyword)) {
              matchedKeywords.push(match.keyword);
              if (match.snippet && !relevantSnippets.includes(match.snippet)) {
                relevantSnippets.push(match.snippet);
              }
            }
          }
        } catch {
          // Semantic search failed, continue with text matches only
        }
      }

      return {
        matchedKeywords: [...new Set(matchedKeywords)],
        totalKeywords: keywords.length,
        relevantSnippets: relevantSnippets.slice(0, 5),
      };
    } catch (error) {
      // Fallback to simple text search if everything fails
      console.error('[InMemoryVectorSearch] Search failed, using text fallback:', error);
      return this.textSearchFallback(text, keywords);
    }
  }

  /**
   * Finds semantic matches for keywords using embeddings.
   */
  private async findSemanticMatches(
    chunks: string[],
    keywords: string[],
  ): Promise<Array<{ keyword: string; snippet: string; score: number }>> {
    const results: Array<{ keyword: string; snippet: string; score: number }> = [];

    // Generate embeddings for chunks
    const chunkEmbeddings = await this.embeddings.embedDocuments(chunks);

    // Generate embeddings for keywords
    const keywordEmbeddings = await this.embeddings.embedDocuments(keywords);

    // Find best matching chunks for each keyword
    for (let ki = 0; ki < keywords.length; ki++) {
      let bestScore = 0;
      let bestChunkIndex = -1;

      for (let ci = 0; ci < chunks.length; ci++) {
        const score = this.cosineSimilarity(keywordEmbeddings[ki], chunkEmbeddings[ci]);
        if (score > bestScore) {
          bestScore = score;
          bestChunkIndex = ci;
        }
      }

      if (bestScore >= this.config.similarityThreshold && bestChunkIndex >= 0) {
        results.push({
          keyword: keywords[ki],
          snippet: this.extractSnippet(chunks[bestChunkIndex], keywords[ki]),
          score: bestScore,
        });
      }
    }

    return results;
  }

  /**
   * Calculates cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Performs simple text search as fallback when vector search fails.
   */
  private textSearchFallback(text: string, keywords: string[]): KeywordSearchResult {
    const matchedKeywords: string[] = [];
    const relevantSnippets: string[] = [];

    for (const keyword of keywords) {
      if (this.textContainsKeyword(text, keyword)) {
        matchedKeywords.push(keyword);
        const snippet = this.extractTextSnippet(text, keyword);
        if (snippet) {
          relevantSnippets.push(snippet);
        }
      }
    }

    return {
      matchedKeywords,
      totalKeywords: keywords.length,
      relevantSnippets: relevantSnippets.slice(0, 5),
    };
  }

  /**
   * Checks if text contains a keyword (case-insensitive, word boundary aware).
   */
  private textContainsKeyword(text: string, keyword: string): boolean {
    const normalizedText = text.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();

    // Try exact match first
    if (normalizedText.includes(normalizedKeyword)) {
      return true;
    }

    // Try with common variations
    const variations = [
      normalizedKeyword,
      normalizedKeyword.replace(/-/g, ' '),
      normalizedKeyword.replace(/ /g, '-'),
      normalizedKeyword.replace(/à/g, 'a'),
      normalizedKeyword.replace(/è/g, 'e'),
      normalizedKeyword.replace(/é/g, 'e'),
      normalizedKeyword.replace(/ì/g, 'i'),
      normalizedKeyword.replace(/ò/g, 'o'),
      normalizedKeyword.replace(/ù/g, 'u'),
    ];

    return variations.some((v) => normalizedText.includes(v));
  }

  /**
   * Extracts a snippet from document content around the keyword.
   */
  private extractSnippet(content: string, keyword: string): string {
    const maxLength = 200;

    // If content is short enough, return as is
    if (content.length <= maxLength) {
      return content.trim();
    }

    // Try to find keyword position
    const keywordLower = keyword.toLowerCase();
    const contentLower = content.toLowerCase();
    const keywordIndex = contentLower.indexOf(keywordLower);

    if (keywordIndex >= 0) {
      // Extract context around keyword
      const start = Math.max(0, keywordIndex - 80);
      const end = Math.min(content.length, keywordIndex + keyword.length + 80);
      let snippet = content.substring(start, end).trim();

      // Add ellipsis if truncated
      if (start > 0) snippet = '...' + snippet;
      if (end < content.length) snippet = snippet + '...';

      return snippet;
    }

    // Return beginning of content if keyword not found
    return content.substring(0, maxLength).trim() + '...';
  }

  /**
   * Extracts a snippet from raw text around the keyword.
   */
  private extractTextSnippet(text: string, keyword: string): string {
    const keywordLower = keyword.toLowerCase();
    const textLower = text.toLowerCase();
    const keywordIndex = textLower.indexOf(keywordLower);

    if (keywordIndex < 0) {
      return '';
    }

    const contextLength = 100;
    const start = Math.max(0, keywordIndex - contextLength);
    const end = Math.min(text.length, keywordIndex + keyword.length + contextLength);

    let snippet = text.substring(start, end).trim();

    // Clean up and add ellipsis
    snippet = snippet.replace(/\s+/g, ' ');
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }
}
