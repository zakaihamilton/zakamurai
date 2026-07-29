import { Notification } from '@/components/ui/Notification';
import { useAppBackgroundServices } from '../AppBackgroundServices';

export default function AppBackgroundServices() {
  useAppBackgroundServices();

  return <Notification />;
}
