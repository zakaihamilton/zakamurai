import type { Components } from 'react-markdown';
import styles from './ReasoningMarkdown.module.css';

export const markdownComponents: Components = {
  a: ({ node, children, ...props }) => (
    <a className={styles.link} {...props}>
      {children}
    </a>
  ),
  blockquote: ({ node, ...props }) => <blockquote className={styles.blockquote} {...props} />,
  code: ({ node, children, className, ...props }) => {
    return className === 'streaming-character-count' ? (
      <span className={styles.streamingCount}>{children}</span>
    ) : (
      <code className={`${styles.code}${className ? ` ${className}` : ''}`} {...props}>
        {children}
      </code>
    );
  },
  h1: ({ node, children, ...props }) => (
    <h1 className={styles.heading} {...props}>
      {children}
    </h1>
  ),
  h2: ({ node, children, ...props }) => (
    <h2 className={styles.heading} {...props}>
      {children}
    </h2>
  ),
  h3: ({ node, children, ...props }) => (
    <h3 className={styles.heading} {...props}>
      {children}
    </h3>
  ),
  h4: ({ node, children, ...props }) => (
    <h4 className={styles.heading} {...props}>
      {children}
    </h4>
  ),
  h5: ({ node, children, ...props }) => (
    <h5 className={styles.heading} {...props}>
      {children}
    </h5>
  ),
  h6: ({ node, children, ...props }) => (
    <h6 className={styles.heading} {...props}>
      {children}
    </h6>
  ),
  li: ({ node, ...props }) => <li className={styles.listItem} {...props} />,
  ol: ({ node, ...props }) => <ol className={styles.list} {...props} />,
  p: ({ node, ...props }) => <p className={styles.paragraph} {...props} />,
  pre: ({ node, ...props }) => <pre className={styles.pre} {...props} />,
  ul: ({ node, ...props }) => <ul className={styles.list} {...props} />,
};

export const summaryMarkdownComponents: Components = {
  code: ({ node, ...props }) => <code className={styles.code} {...props} />,
  h2: ({ node, children, ...props }) => (
    <h2 className={styles.stepHeading} {...props}>
      {children}
    </h2>
  ),
  li: ({ node, ...props }) => <li className={styles.listItem} {...props} />,
  p: ({ node, ...props }) => <p className={styles.paragraph} {...props} />,
  ul: ({ node, ...props }) => <ul className={styles.list} {...props} />,
};
