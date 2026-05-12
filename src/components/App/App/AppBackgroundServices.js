import { Notification } from '@/components/Widgets/Notification/Notification';
import React from 'react';
import { useAppBackgroundServices } from '../Hooks/AppBackgroundServices';

export default function AppBackgroundServices() {
  useAppBackgroundServices();

  return <Notification />;
}
