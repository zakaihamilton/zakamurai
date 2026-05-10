import { AppState } from '@/components/App/AppState';
import Settings from '@/components/Storage/Settings';
import { useEffect } from 'react';

export default function ProjectNameSaver() {
  const { projectName } = AppState.useState();
  useEffect(() => {
    Settings.setProjectName(projectName);
  }, [projectName]);
  return null;
}
