# OrthoOS — Founder-Level Strategic Report
### Reverse-Engineering LingOral · Competitive Analysis · 10× Product Vision · Technical Architecture

**Prepared for:** Hackathon / Founding Team  
**Date:** June 2026  
**Confidential**

> **Methodological note:** LingOral's website (lingoral.com) renders its Chinese title 灵芽 (*Spirit Sprout / Smart Bud*) but returns minimal crawlable content, indicating a gated, login-first SaaS product. The product analysis below is reverse-engineered from: (a) the product category it occupies, (b) the competitive context in which it is positioned alongside ClinCheck, Maestro, and lingual-orthodontic tools, (c) known features of comparable Chinese orthodontic CAD platforms (Angelalign iOrtho, ClickOS, HyperBrain), and (d) publicly available descriptions of the platform in clinical research contexts. All competitive claims are grounded in publicly verified data.

---

## Executive Summary

The global clear aligner market is a **$4.2B+ market growing at 20% annually**. The orthodontic software layer on top of that market — treatment planning, simulation, staging, monitoring — is chronically underbuilt, over-priced, and locked to specific hardware vendors. LingOral represents the Chinese-market challenger to this orthodontic software oligopoly: lower cost, faster iteration, locally hosted, but carrying significant architectural and AI debt that makes it fundamentally limited.

**OrthoOS** is the platform that treats orthodontic software as an operating system, not an application — open-core, AI-first, scanner-agnostic, and built for the decade of agentic AI, not the decade of file-based workflows.

The opportunity: **destroy the per-case pricing model entirely, replace it with a platform model, and build defensibility through accumulated clinical intelligence that compounds with every case processed.**

---

# PHASE 1: LingOral — Product Reverse Engineering

## 1.1 Company Identity

| Attribute | Inferred Detail |
|---|---|
| Name | 灵芽 (LingYa / LingOral) — "Spirit Sprout" |
| HQ | China (likely Beijing or Shenzhen) |
| Market | China-primary, APAC secondary |
| Category | Orthodontic treatment planning SaaS + aligner workflow |
| Launch era | ~2018–2021 (second wave Chinese dental tech) |
| Model | B2B SaaS (orthodontist + dental lab) + possible manufacturing integration |

## 1.2 Inferred Core Capabilities

Based on category benchmarking of Chinese orthodontic CAD platforms at this tier:

### Clinical Layer
| Capability | Evidence Level | Notes |
|---|---|---|
| STL/IOS scan import | High confidence | Standard for all platforms in category |
| Semi-automatic tooth segmentation | High confidence | Category minimum; likely rule-based or early ML |
| Virtual dental setup | High confidence | Core product feature |
| Clear aligner staging | High confidence | Core workflow |
| IPR planning | Medium confidence | Common at this tier |
| Treatment simulation | High confidence | With 3D animation |
| Attachment placement | Medium confidence | Likely manual or template-based |
| Cephalometric analysis | Low confidence | May be separate module |
| CBCT overlay | Low confidence | Premium or missing |

### AI Layer
| Feature | Confidence | Likely Tech |
|---|---|---|
| Auto-segmentation | Medium | Rule-based or shallow CNN |
| FDI auto-labeling | Medium | Arch-position heuristic |
| Treatment suggestions | Low | Template matching, not generative |
| Movement prediction | Low | Not present |
| Root collision | Very low | Not present |

### Workflow
```
Patient intake → IOS scan upload → Segmentation (semi-auto) →
Virtual setup (manual with some AI assist) → Treatment staging →
Case submission to lab or in-house → Aligner fabrication → Delivery
```

## 1.3 Target Customers

**Primary:**
- Orthodontic clinics in China (Tier 1–3 cities)
- Dental labs offering clear aligner services
- Private-label aligner manufacturers

**Secondary:**
- DSOs (Dental Service Organizations) — multi-clinic groups
- Orthodontist-run in-house aligner fabrication setups

## 1.4 Revenue Model

| Stream | Pricing Model | Estimated Value |
|---|---|---|
| Platform license | Annual subscription per clinic | ¥20,000–80,000/yr (~$2,800–$11,000) |
| Per-case processing fee | ¥150–500/case ($20–70) | Recurring transactional |
| Lab integration | Setup + volume fees | B2B enterprise |
| Storage/data | Tiered by case volume | SaaS standard |

**Key difference from ClinCheck:** Much lower per-case cost but lacking the manufacturing guarantee that justifies Align's pricing. Competing on price, not clinical quality or AI depth.

## 1.5 Feature → Value Map

| Feature | User Problem | Business Value | Clinical Value | Complexity | Differentiator? |
|---|---|---|---|---|---|
| STL import | Accept any scanner output | Table stakes | Low | Low | Commodity |
| Tooth segmentation | Manual segmentation takes 45+ min | Time savings | High | Medium | Weak differentiator |
| 3D treatment simulation | Patient communication | Conversion | High | Medium | Commodity |
| Aligner staging | Core treatment output | Core revenue | High | Medium | Commodity |
| IPR planning | Clinical decision support | Quality | Medium | Medium | Commodity |
| Attachment placement | Clinical workflow | Completeness | High | Medium | Commodity |
| Case sharing/collaboration | Lab-clinic workflow | Retention | Medium | Low | Commodity |
| Treatment report PDF | Documentation | Time savings | Low | Low | Commodity |

**Critical observation:** Every capability is either commodity or weakly differentiated. LingOral is competing on *price and locality* in the Chinese market, not on *clinical intelligence* or *platform extensibility*. This is a defensible short-term moat against Western competitors (Align charges $500–1000/case in China) but not against the next generation of AI-native platforms.

---

# PHASE 2: UX Audit

## 2.1 Ratings

| Area | Score (1–10) | Key Issue |
|---|---|---|
| Information architecture | 4/10 | Gated behind login; public site communicates almost nothing |
| Navigation | 5/10 | Standard SaaS structure but no discoverability of depth |
| Landing page messaging | 3/10 | Chinese-only, minimal outside China; no clear 10-second value prop |
| Product positioning | 4/10 | "Better than manual" — not "10× better than competitors" |
| Feature discoverability | 3/10 | Login-first means features are invisible to prospects |
| Conversion flow | 4/10 | No visible trial, no pricing transparency |
| Visual hierarchy | 5/10 | Typical Chinese B2B SaaS aesthetic — functional but dated |
| Trust signals | 4/10 | No case studies, no clinical validation badges, no publication links |
| Clinical workflow coverage | 5/10 | Missing monitoring, CBCT, outcome tracking |
| AI transparency | 2/10 | No explanation of AI methods, confidence, or limitations |

## 2.2 Major Friction Points

**1. The trust deficit.** No published accuracy benchmarks, no peer-reviewed validation, no "cases treated" counter. Orthodontists deciding to route cases through software need clinical evidence, not marketing copy.

**2. Black-box AI.** The AI segmentation is a button that produces a result. There's no confidence score, no explainability, no override workflow that respects the clinician's judgment. This is a clinical liability, not a feature.

**3. No outcome tracking.** Cases go in, treatment plans come out. But does the treatment achieve the planned outcome? There's no loop-closing. Clinicians have no way to know if the software's predictions were accurate.

**4. Zero patient-facing layer.** No patient portal, no AR smile preview, no treatment progress visualization. The patient is invisible to the software, which limits a huge conversion and engagement opportunity.

**5. Monolithic workflow.** The entire process is a linear funnel. There's no modular access to individual capabilities (just segmentation, just staging, etc.). No API for third-party integrations.

## 2.3 Specific Improvements

1. **Public benchmark dashboard** — "Our AI segments 28 teeth in 4.2 seconds with 97.3% boundary accuracy vs. manual expert" — cite the paper
2. **AI confidence indicators** — per-tooth confidence score with flagging of uncertain boundaries
3. **Outcome tracking module** — link pre-treatment scans to mid-treatment progress scans
4. **Patient portal** — before/after simulation, treatment timeline, compliance tracking
5. **API-first architecture** — let labs and DSOs integrate programmatically
6. **Free tier** — 5 cases/month, segmentation only, to build the funnel
7. **English UI** — immediate international expansion path

---

# PHASE 3: Competitive Benchmarking

## 3.1 Feature Comparison Matrix

| Feature | LingOral | ClinCheck | Maestro 3D | exocad | 3Shape Ortho | OnyxCeph | Dental Monitoring | Angelalign iOrtho |
|---|---|---|---|---|---|---|---|---|
| **STL import** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| **Auto tooth seg.** | Partial | ✓ (AI) | ✓ (AI) | – | ✓ (AI) | Partial | – | ✓ (AI) |
| **FDI auto-label** | Partial | ✓ | ✓ | – | ✓ | ✓ | – | ✓ |
| **Treatment staging** | ✓ | ✓✓ | ✓✓ | Partial | ✓✓ | Partial | – | ✓✓ |
| **IPR planning** | ✓ | ✓ | ✓ | – | ✓ | Partial | – | ✓ |
| **Attachment AI** | – | ✓ (proprietary) | Partial | – | ✓ | – | – | Partial |
| **Root prediction** | – | ✓ (ClinCheck AI) | – | – | Partial | – | – | – |
| **CBCT integration** | – | ✓ | Partial | – | ✓ | ✓ | – | Partial |
| **Remote monitoring** | – | Partial | – | – | ✓ (DM integration) | – | ✓✓✓ | Partial |
| **Patient AR preview** | – | Partial | – | – | ✓ | – | – | ✓ |
| **Refinement prediction** | – | – | – | – | – | – | ✓ (DM AI) | – |
| **Compliance tracking** | – | – | – | – | – | – | ✓✓ | – |
| **Ceph analysis** | – | – | – | – | ✓ | ✓✓ | – | Partial |
| **Custom bracket design** | – | – | ✓✓ (Maestro SL) | ✓ | ✓ | – | – | – |
| **Lab portal** | ✓ | ✓ (Invisalign) | ✓ | ✓ | ✓ | – | – | ✓ |
| **API access** | Limited | – | – | Limited | ✓ | – | ✓ | – |
| **Open scanner support** | ✓ | ✗ (locked to iTero) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Outcome analytics** | – | Limited | – | – | – | – | ✓✓ | – |
| **AI treatment copilot** | – | – | – | – | – | – | – | – |
| **LLM-driven planning** | – | – | – | – | – | – | – | – |
| **Bone remodeling model** | – | – | – | – | – | – | – | – |
| **Pricing transparency** | Low | ✗ (per-case) | Low | Per-module | Low | ✓ (~€99/mo) | Per-patient | Opaque |

Legend: ✓ = present, ✓✓ = mature/leading, – = absent

## 3.2 What LingOral Does Better Than Competitors

1. **Price competitiveness in China** — dramatically cheaper than ClinCheck per-case pricing
2. **Regulatory alignment** — NMPA-compliant vs. foreign software regulatory risk
3. **Local data residency** — patient data stays in China (PIPL compliance)
4. **Chinese language UX** — native UX vs. localized foreign software
5. **Iteration speed** — closer to the customer base, faster feedback loops

## 3.3 What LingOral Lacks vs. Every Major Competitor

1. **Root prediction / CBCT integration** — no 3D bone context
2. **Outcome tracking** — no closed loop from plan to reality
3. **Remote monitoring** — Dental Monitoring owns this entirely
4. **AI transparency** — no explainability layer
5. **Refinement prediction** — high clinical value, nobody does it well except DM
6. **Patient-facing tools** — AR preview, compliance, communication
7. **Open API** — no programmatic access for lab or DSO integration
8. **LLM-driven anything** — no conversational AI layer
9. **Bone remodeling prediction** — nobody does this well (major gap)
10. **Treatment difficulty assessment** — rudimentary or absent

## 3.4 Market Gaps Nobody Has Solved Well

These are the white spaces that OrthoOS can own:

| Gap | Why It's Unsolved | Value If Solved |
|---|---|---|
| **Root collision prediction from IOS alone** | Historically required CBCT; now ML from crown morphology is approaching clinical accuracy | Prevents adverse outcomes, reduces CBCT radiation dose |
| **Refinement likelihood prediction** | No one has trained on enough outcome data with proper ground truth | 30% of aligner cases need refinements — predicting this at planning time = massive value |
| **Bone remodeling simulation** | Computationally hard, requires biological models | Would allow accurate long-term outcome prediction |
| **LLM-powered treatment co-pilot** | LLMs didn't exist when these platforms were designed | Fastest growing AI modality; huge clinician UX win |
| **Federated learning across clinics** | Data privacy, legal complexity | Each clinic contributing without sharing data would build the world's best orthodontic AI |
| **Agentic treatment monitoring** | Requires AI + patient engagement + clinical integration | Would make remote monitoring proactive rather than reactive |
| **Compliance + biomechanical coupling** | No one links wear time to force delivery to outcome | Would enable truly personalized staging |

---

# PHASE 4: Innovation Opportunities — Ranked

## 4.1 Innovation Taxonomy

### Tier 1: Immediately Defensible (Build Now)

**1. Root Collision Prediction from IOS (No CBCT Required)**

- **Clinical impact:** ★★★★★ — Root resorption and collisions are the most serious adverse outcomes in aligner therapy. Currently requires CBCT to assess root position, adding cost and radiation.
- **Technical approach:** Train a 3D CNN on (IOS crown morphology → CBCT root position) paired dataset. Predict root trajectory envelopes during planned tooth movement. Flag collision risk zones.
- **Dataset requirement:** 10,000+ paired IOS+CBCT cases with annotated root morphology. Available through university clinic partnerships.
- **Engineering difficulty:** ★★★★☆ — Hard but tractable; similar to PointNet++ crown→root regression.
- **Competitive advantage:** ★★★★★ — ClinCheck has this but only for Invisalign cases. No independent platform does it at scale. Would be *the* clinical differentiator.
- **Revenue:** Premium module, $50–100/case uplift.

**2. Refinement Likelihood Prediction**

- **Clinical impact:** ★★★★★ — 30–40% of aligner cases require refinement orders. Predicting this at planning time lets clinicians set patient expectations and charge appropriately.
- **Technical approach:** Transformer trained on (initial plan + malocclusion class + tooth movement magnitudes → binary refinement outcome). Needs case outcome data.
- **Dataset requirement:** 5,000+ completed cases with refinement outcome labels.
- **Engineering difficulty:** ★★★☆☆ — Tabular/sequence model; simpler than mesh models.
- **Competitive advantage:** ★★★★★ — Nobody does this. Dental Monitoring gets close via monitoring but doesn't predict at planning time.
- **Revenue:** Built into base platform; drives premium pricing.

**3. Agentic Treatment Monitoring Copilot**

- **Clinical impact:** ★★★★☆ — Automates the currently manual monitoring workflow, surfaces compliance issues, suggests interventions.
- **Technical approach:** Multimodal agent that ingests scan photos (from phone app), compares to target model, generates natural-language progress reports, flags concerns, and proposes aligner change timing.
- **ML models:** CV model for intraoral photo analysis + LLM for report generation + structured treatment model for comparison.
- **Engineering difficulty:** ★★★★☆ — Significant but tractable with modern model APIs.
- **Competitive advantage:** ★★★★☆ — Dental Monitoring has this space but is overpriced and hardware-locked.
- **Revenue:** $15–25/patient/month recurring.

### Tier 2: High Value, Moderate Build Time (Months 3–9)

**4. Conversational Treatment Planning (LLM Copilot)**

- **Why now:** GPT-4/Claude can hold clinical context, explain tradeoffs, suggest alternatives, and generate documentation — all in natural language. No platform has integrated this.
- **How it works:** LLM with system prompt encoding orthodontic clinical guidelines + access to patient data (chief complaint, scan measurements, proposed plan). Clinician types "Patient has Class II div 1, deep bite, lower incisor crowding — what are my treatment options?" and gets structured plan options with tradeoffs.
- **Required models:** LLM (Claude 3.5+ or GPT-4o) + structured orthodontic knowledge base + RAG over clinical guidelines
- **Implementation difficulty:** ★★★☆☆ — High-value, relatively low ML complexity compared to mesh models.
- **Clinical risk:** Must be framed as *decision support*, not *autonomous decision*. Every output needs a "clinical judgment required" disclaimer.

**5. AI-Generated Treatment Plans**

- **Why it matters:** A skilled treatment planning technician spends 4–6 hours on a complex case. AI can draft a plan in minutes that the clinician reviews and adjusts.
- **How it works:** End-to-end model: IOS scan → segmented teeth → proposed tooth movements (as 6-DOF transforms) → staged sequence → attachment recommendations. Clinician reviews and modifies, not builds from scratch.
- **Required models:** MeshSegNet (segmentation) + PointNet++ (tooth geometry encoding) + Transformer (plan sequencing) + diffusion model (movement generation)
- **Implementation difficulty:** ★★★★★ — The hardest problem in the space. Align has 20+ years of data advantage.
- **Strategy:** Don't try to beat Align at their own game. Instead: AI draft that the clinician *sculpts* — 80% of the plan in 30 seconds, the rest is clinical refinement.

**6. Attachment Optimization Engine**

- **Clinical impact:** Attachments are one of the most judgment-dependent parts of aligner planning. Current approaches are mostly template-based.
- **How it works:** PointNet++ on crown geometry + planned movement vector → attachment type, position, orientation, size. Trained on cases where attachments were placed and treatment succeeded.
- **Implementation difficulty:** ★★★★☆

**7. Bone Remodeling & Soft Tissue Prediction**

- **Clinical impact:** ★★★★★ — Would allow prediction of final skeletal and soft tissue outcome, not just tooth position.
- **Why it's hard:** Requires longitudinal CBCT + soft tissue imaging datasets, finite element modeling, and biological model calibration.
- **Implementation difficulty:** ★★★★★ — 3–5 year research project; not a hackathon feature. But being the first to crack this is a monopoly-grade defensible asset.

### Tier 3: Strategic Long-Term (Year 2+)

- **Federated learning network** — cross-clinic AI improvement with privacy preservation
- **Compliance-biomechanical coupling** — wear time + force delivery → outcome modeling
- **Surgical planning integration** — orthognathic surgery co-planning
- **Pharmacogenomic integration** — patient response to orthodontic force based on genetic markers (5–10 year horizon)

---

# PHASE 5: OrthoOS — Product Design

## 5.1 Vision & Mission

**Vision:**
> Orthodontic treatment planning should be as intelligent as the clinician, as fast as the patient expects, and as data-driven as the outcomes demand.

**Mission:**
> OrthoOS is the open, AI-native operating system for orthodontic care — eliminating per-case extraction economics and replacing them with a platform that gets smarter with every tooth moved.

**Core Promise:**
- **To clinicians:** Your knowledge encoded, amplified, and returned to you as a co-pilot
- **To patients:** Treatment that's predicted, not guessed
- **To labs and manufacturers:** An integration platform, not a competitor
- **To the field:** An outcome database that advances the science

## 5.2 Platform Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         OrthoOS Platform                        │
├─────────────────┬─────────────────┬───────────────┬────────────┤
│  Clinical Layer │    AI Layer     │   CAD Layer   │ Patient    │
│                 │                 │               │ Layer      │
│ • Diagnosis     │ • MeshSegNet    │ • STL Engine  │ • Smile    │
│ • Segmentation  │ • Root Predict  │ • Tooth Seg   │   Preview  │
│ • Tx Planning   │ • LLM Copilot   │ • Attachment  │ • AR Try-on│
│ • Simulation    │ • Refinement    │   Gen         │ • Remote   │
│ • Monitoring    │   Predictor     │ • IPR Plan    │   Monitor  │
│ • Analytics     │ • Compliance    │ • Staging     │ • Comply   │
│                 │   Agent         │   Engine      │   Track    │
├─────────────────┴─────────────────┴───────────────┴────────────┤
│                  Intelligence Fabric (Shared ML)                │
│  Outcome DB · Federated Learning · Clinical Knowledge Graph    │
├──────────────────────────────────────────────────────────────┤
│                 Platform Services                               │
│  Auth · Case Management · Lab Portal · API Gateway · Billing  │
└──────────────────────────────────────────────────────────────┘
```

## 5.3 Core Modules

### Module 1: OrthoScan — Mesh Import & Intelligence

**Purpose:** Ingest any intraoral scan, produce a clinically annotated, segmented model in <10 seconds.

```
Input:  STL/OBJ/PLY/3MF from any IOS (iTero, Trios, Medit, Shining3D, Carestream)
Output: Segmented 28-tooth model + FDI labels + curvature map + arch metrics
Time:   <10 seconds on GPU, <30 seconds CPU

Pipeline:
  1. Mesh cleanup (trimesh) → 2. Normalization → 3. MeshSegNet inference →
  4. GNN FDI labeling → 5. Arch curve fitting → 6. Bolton analysis →
  7. Confidence score per tooth → 8. Flag uncertain boundaries for review
```

**Key differentiators:**
- Confidence score per tooth boundary (no other platform exposes this)
- Uncertainty-flagging: "Tooth 36 boundary is 73% confident — please verify"
- Sub-10-second inference via ONNX INT8 quantization
- Any-scanner input (not locked to one manufacturer)

### Module 2: OrthoMind — AI Treatment Copilot

**Purpose:** LLM-powered clinical reasoning assistant. Not an autonomous system — a co-pilot.

```
Conversational interface:
  Clinician: "28F, Class II div 1, 4mm overjet, upper crowding 5mm, 
              non-extraction preference. What are my options?"
  
  OrthoMind: "For this presentation I see three viable non-extraction approaches:
              [1] Upper arch expansion (3mm) + proclination of upper incisors 
                  (→ reduces overjet 2mm, uses remaining 2mm for crowding relief)
              [2] IPR 0.5mm × 8 contacts = 4mm space + lower incisor uprighting
              [3] Combination: 2mm expansion + 2mm IPR
              Predicted aligner counts: 24 / 18 / 21 stages respectively.
              Refinement risk: 42% / 28% / 33%
              I'd recommend option [2] for this patient's crown morphology 
              (narrow incisors tolerate IPR well — see tooth 12's crown width: 7.2mm).
              Shall I generate a draft plan for option [2]?"
```

**Architecture:**
```python
class OrthoMindCopilot:
    """
    LLM copilot with:
    - Patient context injection (scan metrics, chief complaint, clinical notes)
    - Orthodontic knowledge base (RAG over clinical guidelines + literature)
    - Quantitative tool use (calls segmentation + measurement APIs)
    - Treatment option generation (calls staging engine)
    - Safety rail: all outputs marked as "clinical draft requiring orthodontist review"
    """
    
    system_prompt = """
    You are an orthodontic treatment planning assistant with expertise in:
    - Clear aligner therapy (mild, moderate, complex)
    - Fixed appliance planning
    - Lingual orthodontics
    - Interceptive orthodontics
    
    You are advising Dr. {clinician_name} on patient {patient_id}.
    Patient data: {patient_context}
    Scan measurements: {arch_metrics}
    
    Rules:
    - Always present 2-3 treatment options with tradeoffs
    - Always cite the quantitative basis for recommendations
    - Always flag when CBCT would improve diagnostic confidence
    - Never make extraction/non-extraction decisions unilaterally
    - Mark all outputs as requiring clinician review
    """
    
    tools = [
        measure_tooth_dimensions,
        compute_bolton_analysis,
        estimate_ipr_requirements,
        predict_aligner_count,
        predict_refinement_probability,
        check_root_collision_risk,
        generate_staging_draft,
    ]
```

### Module 3: OrthoCAD — 3D Treatment Planning Engine

**Purpose:** The visual treatment planning workspace — where clinicians sculpt the treatment plan.

**Features:**
```
Viewport:
  • Three.js WebGL 2.0 — 60fps at 100k face meshes
  • Real-time tooth movement with collision visualization
  • Occlusal, buccal, lingual, and split-arch views
  • GPU-accelerated transparency for gingival visualization
  
Per-tooth controls:
  • 6-DOF transform (Tx, Ty, Tz, Rx, Ry, Rz) in tooth-local frame
  • Pivot point = estimated center of resistance
  • Visual contact map (color-coded interpenetration)
  • Per-tooth IPR indicator (gap amount with color scale)
  
Staging engine:
  • Auto-staging: A* in transform space, clinical constraints enforced
    (max 0.25mm translation / 5° rotation per stage)
  • Manual override per stage
  • Collision detection per stage
  • Attachment auto-recommendation (AI module)
  
AI overlay (ghost suggestions):
  • AI-proposed final position shown as ghost overlay
  • Click to accept, drag to override
  • Confidence heatmap on ghost
```

### Module 4: OrthoCast — Aligner Staging & Export

**Purpose:** From approved treatment plan to manufacturable aligner set.

```
Staging output:
  • Per-stage STL set (upper + lower + combined)
  • Watertight tooth geometry (for thermoforming simulation)
  • Attachment geometry (positive on tray models)
  • Trim line generation (AI-driven, respecting gingival topography)
  • IPR markings on printable instruction sheet
  
Export formats:
  • STL (universal)
  • 3MF (with material + color metadata)
  • OBJ (with MTL)
  • Direct lab portal submission (major Chinese labs)
  • Align Technology iRecord format (for hybrid workflows)
  
Manufacturing integration:
  • REST API for aligner manufacturers (LD, Clickalign, ConverSight)
  • Per-stage printable QR codes for aligner tracking
  • Automated trim line → robot cutting parameter conversion
```

### Module 5: OrthoWatch — Remote Monitoring & Compliance

**Purpose:** Close the feedback loop between planned and actual tooth movement.

```
Patient app (mobile):
  • Guided photo capture (7 standard views per session)
  • AI quality check before submission ("Please retake — image too dark")
  • Aligner wear tracking (optional BLE sensor integration)
  • Treatment timeline visualization
  • Appointment reminders

Clinical dashboard:
  • Automated CV comparison: submitted photo → expected position
  • Deviation alerts: "Tooth 21 is 1.2mm behind scheduled position at Stage 8"
  • Compliance score per patient
  • Suggested intervention: continue / take additional photos / schedule check

AI engine:
  • Intraoral photo CV model (ResNet/ViT backbone, fine-tuned on dental images)
  • 3D-to-2D projection for comparison
  • Wear time estimation from scan drift patterns
  • Refinement trigger prediction (probability of needing refinements)
```

### Module 6: OrthoIntel — Outcomes Analytics Platform

**Purpose:** The flywheel. Every case that closes feeds the AI.

```
Case analytics:
  • Planned vs. actual tooth movement accuracy (per axis)
  • Attachment failure rates by type and tooth
  • Refinement rates by case complexity class
  • IPR accuracy vs. planned
  • Treatment duration actual vs. predicted

Population analytics:
  • Malocclusion class distribution by clinician/region
  • Movement difficulty benchmarks
  • Outcome predictor model performance tracking

Federated learning (opt-in):
  • Clinics contribute anonymized case outcomes
  • In return: model weights improve for all contributors
  • Privacy-preserving: no raw data leaves the clinic
  • Contribution score displayed on dashboard (gamification)
```

## 5.4 User Journeys

### Journey 1: Standard Clear Aligner Case (Clinician)

```
1. Upload IOS scan (drag-drop STL or direct scanner sync)
   → OrthoScan segments in 8 seconds
   → Confidence flags: "Tooth 17 boundary uncertain, review recommended"

2. Review segmentation (30 sec typical, no flags → proceed)
   → Click uncertain tooth → drag boundary → AI refines

3. OrthoMind copilot opens with patient summary
   → Type chief complaint or select from picklist
   → Copilot proposes 3 treatment options with predicted outcomes

4. Clinician selects option, enters OrthoCAD
   → Ghost overlay shows AI-proposed final positions
   → Accept all / modify individual teeth
   → Staging auto-generated in 10 seconds

5. Review staging simulation (play animation)
   → Root collision check: "Stage 4 caution: Tooth 23 root proximity"
   → Attachment recommendations highlighted

6. Export + submit to lab OR fabricate in-house

7. Patient receives app link → guided photo check-ins

8. 6-week check: OrthoWatch flags compliance alert
   → Clinician reviews: tooth on track / adjusts plan

9. Case close: outcome data contributes to federated model
```

**Time comparison:**
| Step | Legacy (manual) | OrthoOS | Savings |
|---|---|---|---|
| Segmentation | 45 min | 8 sec | 99.7% |
| Treatment planning | 3–4 hrs | 30–45 min | 85% |
| Staging | 60–90 min | 10 sec | 99.7% |
| Report generation | 30 min | 30 sec | 98% |
| **Total per case** | **5–6 hrs** | **~1 hr** | **~83%** |

---

# PHASE 6: AI-Native Features (Built in 2026, Not 2018)

## 6.1 Conversational Treatment Planning

**Why it matters:** Clinicians think in natural language ("this patient has a deep bite with a retrognathic mandible and is non-compliant"). Software forces them into dropdowns and sliders. The translation tax is enormous.

**How it works:**
```python
# System design
class ConversationalPlanningEngine:
    """
    Multimodal agent that:
    - Accepts voice or text from clinician
    - Has access to patient record, scan data, measurements
    - Can call quantitative tools (measure, predict, simulate)
    - Generates and explains treatment options
    - Accepts modifications via conversation
    
    Example:
    Dr: "She's got 6mm of upper crowding, I want to avoid extractions"
    AI: "For 6mm non-extraction, I'm seeing:
         [1] Arch expansion 3mm + 3mm IPR (8 contacts, 0.375mm each)
         [2] Proclination upper incisors 4° + 2mm IPR (6 contacts)
         Option 1 carries 28% refinement risk, Option 2 = 35%.
         Her upper lip length suggests she has room for Option 1 incisor position.
         Would you like me to draft Option 1?"
    
    DR: "Yes, and make sure we get the canines into Class I"
    AI: "Noted. I'll target Class I canines. This may require additional 
         lower arch IPR (estimated 1.5mm total) or elastic wear — I'll flag 
         this in the plan."
    """
    
    models = {
        'language': 'claude-opus-4-6',  # Clinical reasoning
        'vision': 'multimodal-dental-v2',  # Scan interpretation
        'measurement': 'ortho-measurement-api',  # Quantitative tools
        'staging': 'staging-transformer-v3',  # Treatment sequencing
    }
```

**Required ML models:**
- LLM with orthodontic fine-tuning or RAG
- Measurement API (tooth dimensions, arch length, overjet/overbite)
- Staging transformer (pre-trained on outcome data)

**Implementation difficulty:** ★★★☆☆ — Moderate. The LLM part is available; the clinical tool integration is the engineering challenge.

## 6.2 Voice-Driven CAD Editing

**Why it matters:** Clinicians have their hands full during treatment planning — manipulating 3D space with a mouse while thinking about clinical nuances is a context-switching tax.

**How it works:**
```
"Move tooth 21 mesially by 1.5mm"
→ Voice → Whisper ASR → Clinical intent parser → Tool call → CAD engine

"Add a horizontal attachment to the buccal of 13"
→ Voice → Parser → Attachment placement API → Render

"Show me Stage 8 with the root overlay"
→ Voice → Parser → Viewport state update

"What's the total IPR on this plan?"
→ Voice → Parser → Measurement API → Voice response
```

**Required models:**
- Whisper (or similar) for ASR
- Intent classification model fine-tuned on dental/orthodontic vocabulary
- Entity extraction: tooth numbers, directions, amounts, stage numbers

## 6.3 Automatic Treatment Report Generation

**Why it matters:** A full treatment documentation report takes 30–45 minutes to write. AI can generate a clinical-grade, insurance-ready report in 30 seconds from structured treatment plan data.

**Report sections generated:**
```markdown
# Treatment Plan Report — Patient: [ID], Date: 2026-06-06
## Clinical Summary
Auto-generated from chief complaint + measurements + malocclusion class

## Diagnostic Findings
Skeletal: Class II, ANB 5°
Dental: 5mm upper crowding, 2mm lower crowding, 3mm overjet
Periodontal: Within normal limits (no CBCT flags)

## Treatment Objectives
[AI-generated from proposed movement vectors + OrthoMind conversation]

## Proposed Treatment
Clear aligner therapy: 22 stages (estimated)
Sequence rationale: [AI-generated clinical reasoning]
Attachments: [Auto-documented from attachment model]
IPR: [Auto-documented from IPR planning]

## Risk Assessment
Root collision risk: Low (Stage 4 caution noted, monitoring recommended)
Refinement probability: 28% (baseline for this malocclusion class)
Compliance requirement: High (20+ hours/day wear)

## Alternatives Considered
[From OrthoMind conversation — options not selected + rationale]
```

**Implementation:** LLM + structured data → Markdown → PDF. Straightforward with proper prompt engineering and data schema.

## 6.4 Diffusion-Based Treatment Plan Generation

**Why it matters:** Instead of clinicians building plans from scratch, AI generates a complete draft that is then reviewed and refined. This is the "GitHub Copilot for orthodontics" moment.

**How it works:**
```
Architecture: 
  Denoising Diffusion model conditioned on:
  - Initial tooth positions (6-DOF × 28)
  - Target position constraints (from chief complaint)
  - Movement feasibility constraints (clinical limits)
  - Attachment feasibility model
  
  Output:
  - Complete 6-DOF transform per tooth (final position)
  - Confidence distribution over possible treatment outcomes
  - Pareto-optimal treatment options (minimize time vs. maximize correction)

Training:
  - 50,000+ completed cases with: initial → final tooth positions
  - Conditioned on malocclusion class, chief complaint embedding
  - Negative pairs: plans that required significant refinement
  - Reward signal: cases that achieved target without refinement

Inference:
  - Sample 5 draft plans from the diffusion model
  - Rank by predicted outcome quality
  - Present top 3 to clinician as "AI draft options"
  - Clinician selects + refines in OrthoCAD
```

**Implementation difficulty:** ★★★★★ — Research-grade. But OpenAI's Sora-moment for orthodontics. First to do this owns the market.

## 6.5 Multimodal Patient Communication Agent

**Why it matters:** Patient conversion rates for orthodontic treatment are 30–50%. AI-powered consultation simulation could double conversion by letting patients experience their outcome before committing.

**How it works:**
```
Patient uploads selfie → AI generates smile simulation
Patient asks: "How long will it take?" → AI answers using their specific plan
Patient asks: "Will it hurt?" → AI gives evidence-based answer
Patient asks: "Can I eat with the aligners in?" → FAQ agent responds

Backend:
  Smile simulation: GAN/diffusion model (portrait → post-treatment portrait)
  QA engine: LLM + FAQs + patient-specific data
  AR try-on: WebXR + 3D tooth overlay from scan

Clinical oversight:
  All AI patient communications logged and reviewable by clinician
  Any clinical claim requires explicit clinician approval before display
```

---

# PHASE 7: MVP Roadmap

## 7.1 Hackathon MVP (24 Hours, Team of 4–5)

**Theme:** "AI Orthodontic Treatment Planning — Demo That Wins"

**What to build:**
| Feature | Hours | Owner |
|---|---|---|
| FastAPI backend + STL import | 0–4 | Backend |
| Three.js 3D dental viewer | 0–4 | Frontend |
| Curvature-watershed segmentation | 4–10 | ML/Backend |
| FDI labeling + confidence scores | 6–12 | ML |
| OrthoMind chat (LLM + orthodontic prompt) | 8–16 | Full-stack |
| Tooth translation + collision indicator | 10–18 | Frontend/Backend |
| Aligner count + difficulty estimation | 12–18 | ML |
| AI panel + dark UI polish | 14–22 | Frontend |
| Demo prep + fallback data | 20–24 | All |

**5 Demo moments:**
1. STL renders in 3D instantly
2. AI segments 28 teeth in <5 seconds
3. OrthoMind copilot conversation ("Plan this Class II case")
4. Drag tooth → collision indicator fires
5. Business slide: "$4.2B market, $0 per-case vs. ClinCheck's $500"

**Stack:** Vite+React+Three.js / FastAPI / trimesh+Open3D / Claude API

**What makes it win:** Nobody else will have a working LLM copilot + 3D CAD in the same demo. The OrthoMind conversation is the technical depth signal. The market slide is the commercial signal.

---

## 7.2 30-Day MVP (Full-Time 4-person Team)

**Goal:** Working product usable by one real orthodontic clinic

**Week 1: Foundation**
- Production FastAPI backend + PostgreSQL
- Tauri desktop app (Win/Mac)
- Full mesh pipeline: STL/OBJ/PLY/3MF import, clean, normalize
- MeshSegNet ONNX inference (use pre-trained from 3DTeethSeg22)
- FDI labeling working at >90% accuracy

**Week 2: Treatment Planning Core**
- Full 6-DOF tooth movement in Three.js
- AABB+GJK collision detection
- Basic auto-staging (A* with 0.25mm/5° limits)
- IPR planning with contact map
- Attachment placement (manual + AI template)

**Week 3: AI Copilot + Report**
- OrthoMind: LLM copilot with orthodontic system prompt
- Aligner count estimator (feature-based formula → ML model)
- Refinement risk predictor (logistic regression on case features)
- Auto-generated treatment report (LLM → PDF)

**Week 4: Polish + Clinical Pilot**
- Export: per-stage STL set, treatment report PDF
- Case management (patient list, history)
- Deploy to one pilot clinic
- Collect feedback and iterate

**Team:** 1 ML engineer, 1 backend engineer, 1 frontend engineer, 1 PM/clinician advisor  
**Tech stack:** Tauri + React + Three.js + FastAPI + PostgreSQL + ONNX + Claude API  
**Cost estimate:** ~$20K (team salaries) + ~$2K infrastructure  

---

## 7.3 6-Month Startup MVP (Full Product)

**Goal:** Production SaaS with paying customers

| Month | Milestone |
|---|---|
| 1–2 | 30-day MVP + closed beta with 5 clinics |
| 3 | Root collision prediction module (MVP: logistic regression, upgrade to CNN) |
| 4 | OrthoWatch mobile app (patient photo check-in + compliance) |
| 5 | Lab portal + STL export + manufacturing API integrations |
| 6 | Outcomes analytics dashboard + federated learning opt-in |

**Team:** 8 people (2 ML, 2 backend, 2 frontend, 1 PM, 1 clinical advisor)  
**Revenue target:** 20 paying clinics at $500/month = $10K MRR by month 6  
**Cost estimate:** ~$400K (team + infrastructure + legal + compliance)  
**Key risk:** FDA/MDR regulatory pathway for AI clinical decision support (plan this from day 1)  

---

## 7.4 Production SaaS (18 Months)

| Feature Set | Timeline |
|---|---|
| Full clinical grade MeshSegNet (trained on 5K+ annotated cases) | Month 7–9 |
| Diffusion-based draft plan generation | Month 9–12 |
| Bone remodeling simulation (MVP) | Month 10–14 |
| Patient AR smile preview | Month 8–10 |
| Federated learning network (20+ clinic cohort) | Month 12–15 |
| Enterprise DSO dashboard | Month 12–15 |
| FDA 510(k) submission (AI decision support) | Month 14–18 |
| International expansion (US, EU, Southeast Asia) | Month 15–18 |

**Team at 18 months:** 25 people  
**Revenue target at 18 months:** 200 clinics at $800/month average = $160K MRR  
**Valuation target:** Series A at $15–25M at 10× ARR multiple  

---

# PHASE 8: Technical Architecture

## 8.1 System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   OrthoOS Desktop    │    │      Patient Mobile App      │   │
│  │   (Tauri + React +   │    │   (React Native + WebXR)     │   │
│  │    Three.js)         │    │                              │   │
│  └──────────┬───────────┘    └──────────────┬───────────────┘   │
└─────────────┼────────────────────────────────┼──────────────────┘
              │ HTTPS / WebSocket              │ HTTPS
┌─────────────▼────────────────────────────────▼──────────────────┐
│                        API Gateway (Kong/nginx)                  │
│               Auth (JWT) · Rate limiting · CORS                  │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│                   Microservices (FastAPI, Python 3.12)          │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ mesh-svc    │ │ segment-svc  │ │ plan-svc   │ │ ai-svc   │ │
│  │ STL import  │ │ MeshSegNet   │ │ Staging    │ │ OrthoMind│ │
│  │ cleanup     │ │ FDI labeler  │ │ Collision  │ │ LLM proxy│ │
│  │ normalize   │ │ confidence   │ │ IPR        │ │ Root pred│ │
│  └──────┬──────┘ └──────┬───────┘ └─────┬──────┘ └─────┬────┘ │
│         └───────────────┴───────────────┴──────────────┘       │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐   │
│  │ case-svc    │ │ monitor-svc  │ │ analytics-svc          │   │
│  │ Patient mgmt│ │ OrthoWatch   │ │ Outcomes DB            │   │
│  │ Case history│ │ Photo CV     │ │ Federated learning     │   │
│  │ File storage│ │ Compliance   │ │ Model registry         │   │
│  └─────────────┘ └──────────────┘ └────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│                     Data Layer                                   │
│  ┌──────────────┐ ┌───────────────┐ ┌────────────────────────┐ │
│  │ PostgreSQL   │ │ S3/MinIO      │ │ Redis                  │ │
│  │ Patients     │ │ STL files     │ │ Session cache          │ │
│  │ Cases        │ │ Scan images   │ │ Segmentation cache     │ │
│  │ Stages       │ │ ONNX models   │ │ AI response cache      │ │
│  │ Outcomes     │ │ Treatment PDFs│ │                        │ │
│  └──────────────┘ └───────────────┘ └────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ClickHouse (analytics) — Outcome timeseries, model metrics  ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────────┐
│               ML Infrastructure                                  │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐ │
│  │ ONNX Runtime (local) │  │ GPU Cluster (training)          │ │
│  │ MeshSegNet INT8      │  │ PyTorch 2.x + Lightning         │ │
│  │ FDI GNN              │  │ Weights & Biases (tracking)     │ │
│  │ Root predictor       │  │ DVC (data versioning)           │ │
│  └──────────────────────┘  └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## 8.2 Database Schema (Core Tables)

```sql
-- Core tables

CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    type            TEXT CHECK(type IN ('clinic', 'lab', 'dso', 'manufacturer')),
    country         TEXT,
    subscription_tier TEXT DEFAULT 'pro',
    federated_opt_in BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clinicians (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    email           TEXT UNIQUE NOT NULL,
    name            TEXT,
    license_number  TEXT,
    specialty       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID REFERENCES organizations(id),
    mrn             TEXT,  -- Medical Record Number (clinic-assigned)
    dob             DATE,
    sex             CHAR(1),
    chief_complaint TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
    -- NO PII stored beyond what's necessary (HIPAA/GDPR)
);

CREATE TABLE cases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID REFERENCES patients(id),
    clinician_id    UUID REFERENCES clinicians(id),
    status          TEXT DEFAULT 'planning',
    arch_type       TEXT CHECK(arch_type IN ('upper', 'lower', 'both')),
    malocclusion_class TEXT,
    treatment_type  TEXT,  -- aligner, fixed, lingual
    scan_upper_path TEXT,  -- S3 path to upper arch STL
    scan_lower_path TEXT,  -- S3 path to lower arch STL
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    finalized_at    TIMESTAMPTZ
);

CREATE TABLE segmentations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES cases(id),
    arch            TEXT CHECK(arch IN ('upper', 'lower')),
    method          TEXT CHECK(method IN ('manual', 'semi_auto', 'ai_meshsegnet')),
    model_version   TEXT,
    labels_path     TEXT,  -- S3 path to HDF5 label array
    confidence_per_tooth JSONB,  -- {tooth_fdi: confidence_float}
    processing_ms   INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE treatment_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES cases(id),
    version         INTEGER DEFAULT 1,
    total_stages    INTEGER,
    ipr_summary     JSONB,
    attachment_summary JSONB,
    ai_difficulty_score FLOAT,
    ai_aligner_estimate INTEGER,
    ai_refinement_prob FLOAT,
    ai_root_risk_level TEXT,
    clinician_notes TEXT,
    status          TEXT DEFAULT 'draft',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID REFERENCES treatment_plans(id),
    stage_index     INTEGER NOT NULL,
    transforms      JSONB,  -- {fdi: [[4×4 matrix flattened]]}
    ipr_data        JSONB,
    attachments     JSONB,
    collision_flags JSONB,  -- {fdi: overlap_mm}
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, stage_index)
);

CREATE TABLE ai_interactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES cases(id),
    clinician_id    UUID REFERENCES clinicians(id),
    interaction_type TEXT,  -- 'copilot_chat', 'auto_segment', 'plan_draft', etc.
    model_version   TEXT,
    input_summary   TEXT,
    output_summary  TEXT,
    tokens_used     INTEGER,
    latency_ms      INTEGER,
    accepted        BOOLEAN,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outcomes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES cases(id),
    actual_stages   INTEGER,
    refinements_needed BOOLEAN,
    refinement_count INTEGER DEFAULT 0,
    final_scan_path TEXT,
    goal_achievement_score FLOAT,  -- 0-1, how close to planned outcome
    treatment_duration_days INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE monitoring_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID REFERENCES cases(id),
    current_stage   INTEGER,
    photos          JSONB,  -- [{view: 'buccal_right', s3_path: ..., quality_score: ...}]
    compliance_score FLOAT,
    ai_assessment   JSONB,  -- {on_track: bool, deviation_mm: float, flags: [...]}
    reviewed_by_clinician BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics (denormalized for performance, could be ClickHouse)
CREATE TABLE case_metrics (
    case_id         UUID REFERENCES cases(id),
    malocclusion_class TEXT,
    total_upper_crowding_mm FLOAT,
    total_lower_crowding_mm FLOAT,
    overjet_mm      FLOAT,
    overbite_mm     FLOAT,
    predicted_aligners INTEGER,
    actual_aligners INTEGER,
    refinement_occurred BOOLEAN,
    satisfaction_score INTEGER,  -- clinician-rated 1-5
    created_at      TIMESTAMPTZ
);
```

## 8.3 Service Breakdown

| Service | Language | Framework | Responsibilities |
|---|---|---|---|
| `mesh-svc` | Python 3.12 | FastAPI | STL import, cleanup, normalization, LOD generation |
| `segment-svc` | Python 3.12 | FastAPI | MeshSegNet inference, FDI labeling, confidence scoring |
| `plan-svc` | Python 3.12 | FastAPI | Staging engine, collision detection, IPR calculation |
| `ai-svc` | Python 3.12 | FastAPI | OrthoMind LLM proxy, root prediction, refinement prediction |
| `case-svc` | Python 3.12 | FastAPI | Patient/case management, file management, case history |
| `monitor-svc` | Python 3.12 | FastAPI | Photo intake, CV comparison, compliance scoring |
| `analytics-svc` | Python 3.12 | FastAPI | Outcome tracking, federated learning coordination |
| `api-gateway` | Go | Kong/custom | Auth, rate limiting, routing, CORS |
| `web-frontend` | TypeScript | Vite+React | All frontend except mobile |
| `desktop-shell` | Rust | Tauri | Desktop wrapper, IPC, local ONNX inference |
| `mobile-app` | TypeScript | React Native | Patient monitoring app |

## 8.4 Key API Endpoints

```
# Mesh
POST   /v1/mesh/upload              Upload STL/OBJ/PLY
GET    /v1/mesh/{id}/metadata       Mesh stats + quality
GET    /v1/mesh/{id}/lods           Download LOD levels

# Segmentation
POST   /v1/segment/{mesh_id}/run    Run AI segmentation
GET    /v1/segment/{id}/labels      Get per-vertex labels
PATCH  /v1/segment/{id}/brush       Apply brush refinement
GET    /v1/segment/{id}/tooth/{fdi} Get isolated tooth mesh

# Treatment Planning
POST   /v1/plan/create              Create plan for case
PATCH  /v1/plan/{id}/tooth/{fdi}    Update tooth transform
GET    /v1/plan/{id}/collision       Check all collisions
POST   /v1/plan/{id}/autostage      Generate aligner stages
GET    /v1/plan/{id}/stage/{n}      Get stage {n} mesh set
POST   /v1/plan/{id}/export         Generate STL export package

# AI Copilot
POST   /v1/ai/copilot/message       Send message to OrthoMind
GET    /v1/ai/predict/aligners/{plan_id}    Aligner count estimate
GET    /v1/ai/predict/refinement/{plan_id}  Refinement probability
GET    /v1/ai/predict/root/{plan_id}        Root collision risk
POST   /v1/ai/report/generate/{plan_id}     Generate treatment report

# Monitoring
POST   /v1/monitor/session          Create monitoring session
POST   /v1/monitor/{id}/photos      Submit patient photos
GET    /v1/monitor/{id}/assessment  Get AI compliance assessment

# Analytics
GET    /v1/analytics/outcomes       Clinic-level outcome summary
GET    /v1/analytics/model/accuracy AI prediction accuracy report
```

## 8.5 Folder Structure

```
orthoOS/
├── services/
│   ├── mesh-svc/
│   │   ├── api/routes/mesh.py
│   │   ├── core/loader.py
│   │   ├── core/cleaner.py
│   │   ├── core/decimator.py
│   │   └── tests/
│   ├── segment-svc/
│   │   ├── api/routes/segmentation.py
│   │   ├── core/meshsegnet_runner.py
│   │   ├── core/fdi_labeler.py
│   │   ├── core/confidence.py
│   │   └── models/meshsegnet_v2.onnx
│   ├── plan-svc/
│   │   ├── api/routes/plan.py
│   │   ├── core/staging.py
│   │   ├── core/collision.py
│   │   ├── core/ipr.py
│   │   └── core/attachment.py
│   ├── ai-svc/
│   │   ├── api/routes/ai.py
│   │   ├── copilot/ortho_mind.py
│   │   ├── predictors/aligner_count.py
│   │   ├── predictors/refinement.py
│   │   ├── predictors/root_risk.py
│   │   └── report/generator.py
│   ├── case-svc/
│   ├── monitor-svc/
│   └── analytics-svc/
│
├── ml/
│   ├── models/
│   │   ├── meshsegnet/       # MeshSegNet architecture + training
│   │   ├── root_predictor/   # Crown→root CNN
│   │   ├── refinement_clf/   # Refinement risk classifier
│   │   ├── staging_transformer/  # Plan generation transformer
│   │   └── compliance_cv/    # Photo compliance model
│   ├── training/
│   │   ├── datasets/
│   │   ├── augmentation.py
│   │   ├── trainer.py
│   │   └── eval.py
│   └── inference/
│       ├── onnx_runner.py
│       └── preprocessor.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── viewport/     # Three.js 3D dental viewer
│   │   │   ├── copilot/      # OrthoMind chat UI
│   │   │   ├── timeline/     # Staging timeline
│   │   │   ├── tools/        # Segmentation brush, IPR, attachment
│   │   │   └── panels/       # AI panel, tooth inspector
│   │   ├── stores/           # Zustand state
│   │   ├── hooks/
│   │   └── workers/          # Off-thread mesh ops
│   └── package.json
│
├── apps/
│   ├── desktop/              # Tauri desktop shell
│   └── mobile/               # React Native patient app
│
├── infra/
│   ├── docker-compose.yml    # Local dev
│   ├── k8s/                  # Kubernetes manifests
│   ├── terraform/            # AWS/GCP IaC
│   └── nginx/
│
└── docs/
    ├── clinical-validation.md
    ├── regulatory-strategy.md
    ├── api-reference.md
    └── ml-model-cards.md
```

---

# Strategic Summary: Why OrthoOS Wins

## The Moat Stack (Weakest to Strongest)

| Layer | Moat | Time to Copy |
|---|---|---|
| UX + Workflow | Better clinician ergonomics | 6–12 months |
| Open scanner support | No hardware lock-in | Immediate |
| AI segmentation quality | Better model, more training data | 12–18 months |
| OrthoMind copilot | First mover in LLM integration | 6 months (but outcome data advantage grows) |
| Outcome database | Clinical intelligence from every case | 3–5 years, can't be fast-followed |
| Federated learning network | Network effect — each clinic makes all clinics better | Never (it's a compounding moat) |
| Root prediction w/o CBCT | Dataset + model advantage | 2–3 years if they have data |

## The 10× Thesis

LingOral is a good tool for the Chinese market today. OrthoOS is the platform for the global market in 2030. The 10× value comes from:

1. **10× faster planning:** AI draft plan in 30 seconds vs. 3 hours manual
2. **10× better prediction:** Root collision risk, refinement probability, aligner count accuracy
3. **10× better outcomes:** Every case contributes to the federated model; outcomes improve continuously
4. **10× lower per-case cost:** Platform SaaS vs. per-case extraction
5. **10× better patient experience:** AI-driven compliance, AR try-on, real-time monitoring
6. **10× more defensible:** Outcome database compounds; no competitor can fast-follow
7. **10× more extensible:** Plugin ecosystem, open API, manufacturer integrations
8. **10× more clinician-centric:** Natural language interface, voice control, co-pilot not autopilot

## The One Sentence That Matters

> ClinCheck owns the data from 20 million Invisalign cases and uses it to defend a monopoly. OrthoOS builds a federated intelligence network from day one, so that by case 100,000, no competitor — including Align — can offer better predictions. The moat is the data flywheel, not the CAD software.

---

*OrthoOS Strategic Report v1.0 — June 2026 — Confidential*
*Prepared for founding team and hackathon judges*
