import {
  EDIT_LOOP_ACTION_CATALOG,
  MANAGER_TOOL_CATALOG,
  type ToolDescriptor,
} from '@/components/AI/Agent/ToolCatalog';
import Dialog from '@/components/ui/Dialog';
import styles from './SupportedToolsDialog.module.css';

type SupportedToolsDialogProps = {
  isOpen: boolean;
  onCancel: () => void;
};

function ToolSection({
  title,
  description,
  tools,
}: {
  title: string;
  description: string;
  tools: readonly ToolDescriptor[];
}) {
  return (
    <section className={styles.section} aria-labelledby={`${title}-title`}>
      <div className={styles.sectionHeader}>
        <h4 id={`${title}-title`}>{title}</h4>
        <p>{description}</p>
      </div>
      <ul className={styles.toolList}>
        {tools.map((tool) => (
          <li className={styles.tool} key={tool.name}>
            <code>{tool.name}</code>
            <span>{tool.purpose}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
export default function SupportedToolsDialog({ isOpen, onCancel }: SupportedToolsDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      title="Supported AI tools"
      onConfirm={onCancel}
      onCancel={onCancel}
      footer={null}
      className={styles.dialog}
    >
      <div className={styles.content}>
        <p className={styles.intro}>
          The local WebLLM agent can use these capabilities while working in your browser-based
          workspace.
        </p>
        <ToolSection
          title="Manager tools"
          description="Workspace and verification tools coordinated by the AI Manager."
          tools={MANAGER_TOOL_CATALOG}
        />
        <ToolSection
          title="Internal edit-loop actions"
          description="Actions used to stage and complete code changes."
          tools={EDIT_LOOP_ACTION_CATALOG}
        />
      </div>
    </Dialog>
  );
}
