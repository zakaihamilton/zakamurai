import ModelGuide from '@/components/AI/Models/ModelGuide';

export const metadata = {
  title: 'Local AI models | Zakamurai',
  description:
    'Compare local AI models by capability, speed, device fit, memory, and download size.',
};

type ModelsPageProps = {
  searchParams: Promise<{ selected?: string | string[] }>;
};

export default async function ModelsPage({ searchParams }: ModelsPageProps) {
  const { selected } = await searchParams;
  const selectedModelId = typeof selected === 'string' ? selected : '';

  return <ModelGuide initialModelId={selectedModelId} />;
}
