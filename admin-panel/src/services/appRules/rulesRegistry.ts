import firebaseRulesRaw from '../../../../firebase.rules.json?raw';
import storageRulesRaw from '../../../../storage.rules?raw';
import appRootRaw from '../../../../App.tsx?raw';
import appAccessGuardRaw from '../../../../src/components/AppAccessGuard.tsx?raw';
import appPhotoImageRaw from '../../../../src/components/AppPhotoImage.tsx?raw';
import photoUploadFieldRaw from '../../../../src/components/PhotoUploadField.tsx?raw';
import softInviteAccessGateRaw from '../../../../src/components/SoftInviteAccessGate.tsx?raw';
import buySellServiceRaw from '../../../../src/services/buySellService.ts?raw';
import deviceAuthRaw from '../../../../src/services/deviceAuth.ts?raw';
import photoUploadServiceRaw from '../../../../src/services/photoUploadService.ts?raw';
import remoteConfigRaw from '../../../../src/services/remoteConfig.ts?raw';
import runtimeMonitorServiceRaw from '../../../../src/services/runtimeMonitorService.ts?raw';
import securityAdminServiceRaw from '../../../../src/services/securityAdminService.ts?raw';
import securityConfigValidatorRaw from '../../../../src/services/securityConfigValidator.ts?raw';
import constantsRaw from '../../../../src/utils/constants.ts?raw';
import featureFlagsRaw from '../../../../src/utils/featureFlags.ts?raw';
import imageCompressorRaw from '../../../../src/utils/imageCompressor.ts?raw';
import moderationRaw from '../../../../src/utils/moderation.ts?raw';
import validatorsRaw from '../../../../src/utils/validators.ts?raw';
import photoModuleStorageRaw from '../../../../src/photo-module/ImageStorage.ts?raw';
import photoModulePickerRaw from '../../../../src/photo-module/PhotoPicker.ts?raw';
import photoModuleQueueRaw from '../../../../src/photo-module/UploadQueue.ts?raw';
import firebaseConfigRaw from '../../../../src/firebase-config.ts?raw';
import adminModerationServiceRaw from '../moderationService.ts?raw';
import type { AppRuleSource, SourceFileSnapshot } from '../../types/appRules';

export const FIREBASE_RULES_SOURCE: AppRuleSource = {
  kind: 'firebase_rules',
  name: 'Database Rules (статический снимок)',
  path: 'firebase.rules.json',
};

export const STORAGE_RULES_SOURCE: AppRuleSource = {
  kind: 'storage_rules',
  name: 'Storage Rules (статический снимок)',
  path: 'storage.rules',
};

export const firebaseRulesText = firebaseRulesRaw;
export const storageRulesText = storageRulesRaw;

export const sourceFiles: SourceFileSnapshot[] = [
  { name: 'App.tsx', path: 'App.tsx', content: appRootRaw },
  { name: 'AppAccessGuard', path: 'src/components/AppAccessGuard.tsx', content: appAccessGuardRaw },
  { name: 'PhotoUploadField', path: 'src/components/PhotoUploadField.tsx', content: photoUploadFieldRaw },
  { name: 'AppPhotoImage', path: 'src/components/AppPhotoImage.tsx', content: appPhotoImageRaw },
  { name: 'SoftInviteAccessGate', path: 'src/components/SoftInviteAccessGate.tsx', content: softInviteAccessGateRaw },
  { name: 'photoUploadService', path: 'src/services/photoUploadService.ts', content: photoUploadServiceRaw },
  { name: 'deviceAuth', path: 'src/services/deviceAuth.ts', content: deviceAuthRaw },
  { name: 'securityAdminService', path: 'src/services/securityAdminService.ts', content: securityAdminServiceRaw },
  { name: 'remoteConfig', path: 'src/services/remoteConfig.ts', content: remoteConfigRaw },
  { name: 'securityConfigValidator', path: 'src/services/securityConfigValidator.ts', content: securityConfigValidatorRaw },
  { name: 'runtimeMonitorService', path: 'src/services/runtimeMonitorService.ts', content: runtimeMonitorServiceRaw },
  { name: 'buySellService', path: 'src/services/buySellService.ts', content: buySellServiceRaw },
  { name: 'validators', path: 'src/utils/validators.ts', content: validatorsRaw },
  { name: 'constants', path: 'src/utils/constants.ts', content: constantsRaw },
  { name: 'featureFlags', path: 'src/utils/featureFlags.ts', content: featureFlagsRaw },
  { name: 'imageCompressor', path: 'src/utils/imageCompressor.ts', content: imageCompressorRaw },
  { name: 'moderation', path: 'src/utils/moderation.ts', content: moderationRaw },
  { name: 'PhotoModule ImageStorage', path: 'src/photo-module/ImageStorage.ts', content: photoModuleStorageRaw },
  { name: 'PhotoModule PhotoPicker', path: 'src/photo-module/PhotoPicker.ts', content: photoModulePickerRaw },
  { name: 'PhotoModule UploadQueue', path: 'src/photo-module/UploadQueue.ts', content: photoModuleQueueRaw },
  { name: 'firebase-config', path: 'src/firebase-config.ts', content: firebaseConfigRaw },
  { name: 'Admin moderationService', path: 'admin-panel/src/services/moderationService.ts', content: adminModerationServiceRaw },
];

export const sourceByName = new Map(sourceFiles.map((file) => [file.name, file]));

export const createSource = (
  kind: AppRuleSource['kind'],
  name: string,
  path: string,
  line?: number,
): AppRuleSource => ({
  kind,
  name,
  path,
  ...(line ? { line } : {}),
});

export const findLine = (content: string, pattern: string | RegExp): number | undefined => {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) =>
    typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line),
  );
  return index >= 0 ? index + 1 : undefined;
};

export const findEvidence = (content: string, pattern: string | RegExp, fallback = 'Фрагмент не найден'): string => {
  const line = content
    .split(/\r?\n/)
    .find((item) => (typeof pattern === 'string' ? item.includes(pattern) : pattern.test(item)));
  return line?.trim().slice(0, 260) || fallback;
};

export const hasPattern = (content: string, pattern: string | RegExp): boolean =>
  typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
