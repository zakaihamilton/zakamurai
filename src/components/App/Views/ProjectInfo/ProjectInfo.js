import React from 'react';
import ProjectAbout from './About';
import ProjectHeader from './Header';
import styles from './ProjectInfo.module.css';
import ProjectTechnologies from './Technologies';
import ProjectVision from './Vision';

export default function ProjectInfo() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <ProjectHeader />
        <ProjectAbout />
        <ProjectTechnologies />
        <ProjectVision />
      </div>
    </div>
  );
}
