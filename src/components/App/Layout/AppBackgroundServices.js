import { Notification } from '@/components/ui/Notification/Notification';
import React from 'react';
import { useAppBackgroundServices } from '../AppBackgroundServices';

export default function AppBackgroundServices() {
  useAppBackgroundServices();

  return <Notification />;
}
