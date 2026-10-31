import { notFound } from 'next/navigation';
import LocalAIBenchmarkRunner from './runner';

export default function LocalAIBenchmarkPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.ZAKAMURAI_AI_BENCH !== '1') {
    notFound();
  }

  return <LocalAIBenchmarkRunner />;
}
