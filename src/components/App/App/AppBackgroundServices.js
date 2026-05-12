import { Notification } from '@/components/Widgets/Notification/Notification';
import React from 'react';
import { useAppBackgroundServices } from '../AppBackgroundServices';

export default function AppBackgroundServices() {
  useAppBackgroundServices();

  return <Notification />;
}
