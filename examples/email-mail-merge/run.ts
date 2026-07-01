import { runPipeline } from '@scriptpipe/core';
import pipeline from './email-mail-merge.pipeline';

await runPipeline(pipeline);
