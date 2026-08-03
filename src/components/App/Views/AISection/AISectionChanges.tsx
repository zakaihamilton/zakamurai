import styles from './AISectionChanges.module.css';

type AISectionChangesProps = {
  content: string;
};

export default function AISectionChanges({ content }: AISectionChangesProps) {
  return <pre className={styles.content}>{content}</pre>;
}
