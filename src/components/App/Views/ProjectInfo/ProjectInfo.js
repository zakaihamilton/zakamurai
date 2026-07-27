import React from 'react';
import styles from './ProjectInfo.module.css';
import ProjectAbout from './subcomponents/ProjectAbout';
import ProjectHeader from './subcomponents/ProjectHeader';
import ProjectTechnologies from './subcomponents/ProjectTechnologies';
import ProjectVision from './subcomponents/ProjectVision';

export default function ProjectInfo() {
  return (
    <div className={`${styles.wrapper} scrollHide`}>
      <div className={styles.container}>
        <ProjectHeader />
        <ProjectAbout />
        <ProjectTechnologies />
        <ProjectVision />
      </div>
    </div>
  );
}
