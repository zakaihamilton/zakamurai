import { Notification } from '@/components/Widgets/Notification/Notification';
import React from 'react';
import KeyboardHandler from '../Manager/KeyboardHandler';
import ContentSaver from '../Persistence/ContentSaver';
import PreviewRestorer from '../Persistence/PreviewRestorer';
import ProjectNameSaver from '../Persistence/ProjectNameSaver';
import TabRestorer from '../Persistence/TabRestorer';

export default function AppBackgroundServices() {
  return (
    <>
      <ProjectNameSaver />
      <Notification />
      <TabRestorer />
      <PreviewRestorer />
      <ContentSaver />
      <KeyboardHandler />
    </>
  );
}
