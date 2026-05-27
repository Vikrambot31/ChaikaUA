export type AppRuleSectionId =
  | 'photos'
  | 'access'
  | 'firebase'
  | 'moderation'
  | 'limits'
  | 'security';

export type AppRuleStatus = 'active' | 'warning' | 'critical' | 'missing' | 'info';

export type AppRuleRisk = 'low' | 'medium' | 'high' | 'critical';

export type AppRuleSourceKind =
  | 'firebase_rules'
  | 'storage_rules'
  | 'runtime_config'
  | 'source_code'
  | 'generated';

export type AppRuleSource = {
  kind: AppRuleSourceKind;
  name: string;
  path: string;
  line?: number;
};

export type AppRuleItem = {
  id: string;
  sectionId: AppRuleSectionId;
  category: string;
  name: string;
  status: AppRuleStatus;
  risk: AppRuleRisk;
  actualValue: string;
  explanation: string;
  evidence: string;
  source: AppRuleSource;
  tags: string[];
  updatedAt: number;
};

export type AppRulePipelineStep = {
  id: string;
  title: string;
  status: AppRuleStatus;
  risk: AppRuleRisk;
  source: AppRuleSource;
  evidence: string;
};

export type AppRulesSection = {
  id: AppRuleSectionId;
  title: string;
  description: string;
  items: AppRuleItem[];
  pipeline?: AppRulePipelineStep[];
};

export type AppRulesRuntimeState = {
  appControl: Record<string, unknown> | null;
  featureFlags: Record<string, unknown> | null;
  securityConfig: Record<string, unknown> | null;
  appControlPath: string;
  featureFlagsPath: string;
  loadedAt: number;
  errors: string[];
};

export type AppRulesSnapshot = {
  generatedAt: number;
  syncStatus: 'ready' | 'error';
  sources: AppRuleSource[];
  sections: AppRulesSection[];
  warnings: AppRuleItem[];
  runtime: AppRulesRuntimeState;
};

export type SourceFileSnapshot = {
  name: string;
  path: string;
  content: string;
};
