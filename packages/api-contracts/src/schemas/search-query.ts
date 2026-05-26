import { z } from 'zod';
import { ListEnvelope, Timestamp } from './common.js';
export const SearchResource = z.enum(['transfer','holding','balance','event','operation']);
export const SearchOperator = z.enum(['eq','contains','prefix','gte','lte']);
export const SearchClause = z.object({ field:z.string(), operator:SearchOperator, value:z.string() });
export const SearchQuery = z.object({ resource:SearchResource, query:z.string().optional(), filters:z.array(SearchClause).max(20).default([]).optional(), limit:z.number().int().min(1).max(100).optional(), starting_after:z.string().optional() });
export const SearchResult = z.object({ id:z.string(), object:z.literal('search_result'), resource:SearchResource, title:z.string(), snippet:z.string().optional(), score:z.number(), updated:Timestamp, projection_watermark:z.string() });
export const SearchResponse = ListEnvelope(SearchResult).extend({ freshness:z.object({ lag_seconds:z.number(), checkpoint:z.string() }) });
