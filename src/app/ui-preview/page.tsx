import { notFound } from 'next/navigation';
import Preview from './preview';

export default function UiPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <Preview />;
}
