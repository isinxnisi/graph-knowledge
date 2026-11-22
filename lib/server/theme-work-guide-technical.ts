import {z} from 'zod';
import {claimThemeProductionSchema,dispatchThemeProductionSubmissionSchema,productionAssessmentSchema} from '../domain/theme-production';
import {captureThemePreviewSchema,generateThemeImageSchema,readThemeEvidenceSchema} from '../domain/theme-automation';

export function workGuideTechnical(phase:'production'|'review',focuses:Set<string>){
 const schema=(value:z.ZodType)=>z.toJSONSchema(value,{io:'input',unrepresentable:'any'});
 return {
  fullContract:'get_theme_authoring_guide',
  claim:schema(claimThemeProductionSchema),
  checkpoint:'update_theme_production',
  ...(phase==='production'?{handoff:'update_theme_production(operation: handoff)'}:{
   assessment:schema(productionAssessmentSchema),
   preview:schema(captureThemePreviewSchema),readEvidence:schema(readThemeEvidenceSchema),
   complete:'update_theme_production(operation: complete)',publicReadback:'check_theme_publication',
  }),
  ...([...focuses].some(focus=>['registration','translation','images','recovery'].includes(focus))?{
   prepare:'prepare_theme_production_submission',dispatch:schema(dispatchThemeProductionSubmissionSchema),
   receipts:['get_theme_production','get_theme_registration','read_theme','read_theme_translation'],
  }:{}),
  ...(focuses.has('images')?{generate:schema(generateThemeImageSchema),automationReceipt:'read_theme_automation'}:{}),
 };
}
