import { runPipeline } from '@scriptpipe/core';
import pipeline from './word-stats.pipeline';

await runPipeline(pipeline);
