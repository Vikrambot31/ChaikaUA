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

// Zone classification: what the admin should actually do with this item
export type AppRuleZone =
  | 'action'     // truly broken / misconfigured — needs attention now
  | 'monitor'    // live runtime toggles — watch, could flip critical
  | 'reference'; // by-design architecture — informational only

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
  zone?: AppRuleZone;       // assigned by parsers or resolved in service layer
  designLabel?: string;     // e.g. "BY DESIGN" for intentional public-read paths
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

export type AppRulesZoneGroup = {
  zone: AppRuleZone;
  label: string;
  description: string;
  items: AppRuleItem[];
  defaultOpen: boolean;
  actionCount: number;
};

export type AppRulesSnapshot = {
  generatedAt: number;
  syncStatus: 'ready' | 'error';
  sources: AppRuleSource[];
  sections: AppRulesSection[];
  warnings: AppRuleItem[];
  runtime: AppRulesRuntimeState;
  zones?: AppRulesZoneGroup[];
};

export type SourceFileSnapshot = {
  name: string;
  path: string;
  content: string;
};
