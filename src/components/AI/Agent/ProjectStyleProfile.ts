import { validateCssModuleRelationships } from '@/components/AI/ChangeValidator';
import type { FileMap } from '@/components/AI/types';
import { PROJECT_STYLE_ROLES, type ProjectStyleProfile } from './ProjectStyleInference';
import { projectStyleRolesForSource } from './ProjectStyleRecipes';
import { RESPONSIVE_GENERATION_CONTRACT } from './Protocol';

export {
  ensureProjectRootTokens,
  generateProjectCssModule,
} from './ProjectCssModuleGenerator';
export {
  PROJECT_STYLE_ROLES,
  type ProjectStyleProfile,
  type ProjectStyleProfileSource,
  type ProjectStyleTokens,
  createProjectStyleProfile,
  fingerprintProjectCss,
  resolveProjectStyleProfile,
} from './ProjectStyleInference';
export { projectStyleRolesForSource } from './ProjectStyleRecipes';

export const formatProjectStyleContract = (
  profile: ProjectStyleProfile,
  options: { responsive?: boolean; modelAuthoredModules?: boolean } = {},
): string => {
  const { tokens } = profile;
  return [
    `Project style: ${profile.source}.`,
    `Use only semantic CSS Module roles: ${PROJECT_STYLE_ROLES.join(', ')}.`,
    `Tokens: background ${tokens.background}; surface ${tokens.surface}; text ${tokens.text}; muted ${tokens.muted}; accent ${tokens.accent}; spacing ${tokens.spacing}; radius ${tokens.radius}.`,
    options.modelAuthoredModules
      ? 'Return the component and every co-located CSS Module as separate path-labelled files. The model authors each stylesheet; host CSS recovery is only a fallback.'
      : 'Return component source only. The host generates missing CSS Module rules deterministically.',
    ...(options.responsive ? [RESPONSIVE_GENERATION_CONTRACT] : []),
  ].join('\n');
};

export const projectStyleRecoveryTrace = (
  files: FileMap,
  recoveredPaths: string[],
  profile?: ProjectStyleProfile,
): Record<string, unknown> | null => {
  if (!profile || !recoveredPaths.length) return null;
  const stylesheetNames = new Set(recoveredPaths.map((path) => path.split('/').pop()));
  const generatedRoles = [
    ...new Set(
      Object.entries(files).flatMap(([path, content]) =>
        /\.(?:jsx|tsx)$/i.test(path) &&
        [...stylesheetNames].some((name) => name && content.includes(name))
          ? projectStyleRolesForSource(content)
          : [],
      ),
    ),
  ].sort();
  return { paths: recoveredPaths, generatedRoles, profileSource: profile.source };
};

export const projectStyleGenerationTrace = (
  path: string,
  source: string,
  profile?: ProjectStyleProfile,
): Record<string, unknown> | null =>
  profile && /\.(?:jsx|tsx)$/i.test(path)
    ? {
        component: path,
        generatedRoles: projectStyleRolesForSource(source),
        profileSource: profile.source,
      }
    : null;

export const repairProjectStyleRelationships = ({
  files,
  targetPath,
  requireCoLocated,
  repair,
}: {
  files: FileMap;
  targetPath: string;
  requireCoLocated: boolean;
  repair: () => string[];
}): { recovered: string[]; remaining: string[] } | null => {
  const options = requireCoLocated ? { requireCoLocatedFor: [targetPath] } : undefined;
  if (!validateCssModuleRelationships(files, options).length) return null;
  const recovered = repair();
  return { recovered, remaining: validateCssModuleRelationships(files, options) };
};
