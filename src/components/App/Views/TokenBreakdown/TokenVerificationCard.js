import { Icons } from '@/components/ui/Icons';
import React from 'react';
import styles from './TokenBreakdown.module.css';

export default function TokenVerificationCard({ result, onClose }) {
  if (!result) return null;
  return (
    <div className={styles.verificationCard}>
      <div className={styles.verificationCardHeader}>
        <div className={styles.verificationTitleGroup}>
          <span className={styles.verificationTitle}>Token Report Alignment Check</span>
          <span
            className={`${styles.verificationStatus} ${
              result.isMatch ? styles.statusSuccess : styles.statusError
            }`}
          >
            {result.isMatch ? 'Match Success' : 'Mismatch Found'}
          </span>
        </div>
        <button
          type="button"
          className={styles.verificationClose}
          onClick={onClose}
          aria-label="Close check results"
        >
          <Icons.Close />
        </button>
      </div>
      <div className={styles.verificationDetails}>
        <div className={styles.verificationMetrics}>
          <VerificationMetric label="Original Length" value={`${result.originalLength} chars`} />
          <VerificationMetric label="Reconstructed" value={`${result.reconstructedLength} chars`} />
          <VerificationMetric label="Total Mismatches" value={result.mismatches.length} />
        </div>
        {result.mismatches.length > 0 && (
          <ul className={styles.mismatchList}>
            {result.mismatches.map((mismatch, index) => (
              <li
                key={`${mismatch.token.value}-${mismatch.token.range?.start ?? index}-${index}`}
                className={styles.mismatchItem}
              >
                <span className={styles.mismatchItemReason}>{mismatch.reason}</span>
                <span className={styles.mismatchItemDetails}>
                  Token: "{mismatch.token.value}" | Type: {mismatch.token.type} | Range: [
                  {mismatch.token.range?.start}, {mismatch.token.range?.end}]
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VerificationMetric({ label, value }) {
  return (
    <div className={styles.verificationMetric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </div>
  );
}
