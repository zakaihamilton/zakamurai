import ProjectCompatibility from '../ProjectInfo/Compatibility';
import ProjectDeviceReadiness from '../ProjectInfo/DeviceReadiness';
import styles from './Readiness.module.css';

export default function Readiness() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>Workspace diagnostics</span>
          <h1>Runtime &amp; device readiness</h1>
          <p>
            Check whether this project can build in the browser and which local AI experience best
            fits the current device.
          </p>
        </header>

        <div className={styles.grid}>
          <ProjectCompatibility />
          <ProjectDeviceReadiness />
        </div>

        <p className={styles.note}>
          These checks are read-only. They describe the current workspace and browser without
          changing project files or model downloads.
        </p>
      </div>
    </div>
  );
}
