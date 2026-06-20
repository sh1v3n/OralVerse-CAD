import { useMemo } from "react";
import * as THREE from "three";
import { useToothObjectStore } from "./toothObjectStore";
import { useTreatmentPlanStore } from "./treatmentPlanStore";
import { computeDiagnostics, ClinicalDiagnostics, ToothData } from "./clinicalMeasurements";

export interface DiagnosticsComparison {
  initial: ClinicalDiagnostics | null;
  current: ClinicalDiagnostics | null;
  target: ClinicalDiagnostics | null;
}

export function useClinicalDiagnostics(): DiagnosticsComparison {
  const { teeth } = useToothObjectStore();
  const { plan, currentStage } = useTreatmentPlanStore();

  const comparison = useMemo(() => {
    if (teeth.length === 0) {
      return { initial: null, current: null, target: null };
    }

    // 1. Current state (from ToothObjectStore directly, applying manual transforms)
    // This is the most accurate reflection of the current "Initial Position" panel UI
    const currentToothData: ToothData[] = teeth.map((t) => {
      const pos = new THREE.Vector3(
        t.centroid.x + t.transform.translation[0],
        t.centroid.y + t.transform.translation[1] + t.transform.intrusion,
        t.centroid.z + t.transform.translation[2]
      );
      return {
        fdi: t.fdi,
        centroid: pos,
        bbox: t.boundingBox,
      };
    });

    const currentDiagnostics = computeDiagnostics(currentToothData);

    // If there's no plan, we only have 'current'
    if (!plan) {
      return { initial: null, current: currentDiagnostics, target: null };
    }

    // 2. Initial state (from Treatment Plan)
    const initialToothData: ToothData[] = teeth.map((t) => {
      const pData = plan.teeth[String(t.fdi)]?.initial;
      const pos = pData 
        ? new THREE.Vector3(...pData.position) 
        : new THREE.Vector3(t.centroid.x, t.centroid.y, t.centroid.z);
      return {
        fdi: t.fdi,
        centroid: pos,
        bbox: t.boundingBox,
      };
    });

    // 3. Target state (Final from Treatment Plan)
    const targetToothData: ToothData[] = teeth.map((t) => {
      const pData = plan.teeth[String(t.fdi)]?.target;
      const pos = pData 
        ? new THREE.Vector3(...pData.position) 
        : new THREE.Vector3(t.centroid.x, t.centroid.y, t.centroid.z);
      return {
        fdi: t.fdi,
        centroid: pos,
        bbox: t.boundingBox,
      };
    });

    // 4. Staged state (if playing back)
    const stagedToothData: ToothData[] = teeth.map((t) => {
      const toothPlan = plan.teeth[String(t.fdi)];
      let pData = toothPlan?.initial;
      if (toothPlan) {
        if (currentStage <= 0) pData = toothPlan.initial;
        else if (currentStage >= plan.totalStages) pData = toothPlan.target;
        else {
          const stageData = toothPlan.stages[currentStage - 1];
          if (stageData) pData = stageData.transform;
        }
      }
      const pos = pData 
        ? new THREE.Vector3(...pData.position) 
        : new THREE.Vector3(t.centroid.x, t.centroid.y, t.centroid.z);
      return {
        fdi: t.fdi,
        centroid: pos,
        bbox: t.boundingBox,
      };
    });

    return {
      initial: computeDiagnostics(initialToothData),
      current: computeDiagnostics(stagedToothData),
      target: computeDiagnostics(targetToothData),
    };
  }, [teeth, plan, currentStage]);

  return comparison;
}
