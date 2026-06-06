# OralVerse – AI-Powered Dental Digital Twin

## Overview

Build a modern healthcare web application called **OralVerse** that creates an interactive 3D digital twin of a user's teeth using uploaded mouth photographs and optional dental reports, X-rays, prescriptions, or clinical documents.

## Important Note

A labeled dental dataset has already been included in the project. Assume all required training, validation, and testing data is available and focus on building the complete AI-powered Dental Digital Twin platform rather than data collection.

## Problem

Dental records are fragmented across clinics, reports, and images. Patients often do not understand which specific tooth has an issue, how severe it is, or how their oral health changes over time.

OralVerse should provide a single visual representation of a patient's dental health through an interactive 3D model.

## Core User Flow

### Step 1: Upload Data

Allow users to upload:

- Multiple photos of their teeth from different angles
  - Front view
  - Left side
  - Right side
  - Upper arch
  - Lower arch
  - Close-up shots

Optional uploads:

- Dental reports (PDF)
- Prescriptions
- Treatment records
- X-rays
- CBCT scans (if available)

### Step 2: AI Processing Pipeline

The system should:

1. Analyze all uploaded mouth photographs.
2. Detect and segment individual teeth.
3. Identify visible dental abnormalities.
4. Extract information from uploaded reports using OCR.
5. Map report findings to the correct tooth whenever possible.
6. Merge visual findings and report findings into a unified dental profile.

### Step 3: Generate Interactive 3D Dental Twin

Create a fully interactive 3D model of the user's teeth.

Requirements:

- Rotate
- Zoom
- Pan
- Tooth-level interaction

Each tooth should be individually selectable.

## Visual Health Indicators

- Green: Healthy
- Yellow: Monitor
- Orange: Moderate issue
- Red: Immediate attention recommended

## Tooth Information Panel

When a user clicks a tooth, display:

- Tooth Number
- Detected Issues
- Severity
- Confidence Score
- Evidence Source
- Recommended Action

## AI Health Summary Dashboard

Display:

- Overall Oral Health Score
- Cavity Risk
- Alignment Score
- Gum Health Score
- Missing Teeth Count
- Treatment Priority List

## Timeline Feature

Store previous scans and compare oral health progression over time.

## Dataset Availability

A dental dataset has already been provided and is available within the project repository/storage.

The application must utilize the provided dataset for:

- Training and fine-tuning tooth detection models
- Tooth segmentation
- Dental issue classification
- Validation and testing
- Mapping annotations to individual teeth

Assume sufficient labeled data is available to train and evaluate:

- Tooth detection
- Tooth segmentation
- Cavity detection
- Alignment analysis
- Dental condition classification
- Report-to-tooth mapping

Focus on building the complete end-to-end product and AI pipeline rather than dataset acquisition.

## Technology Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- Three.js
- React Three Fiber

### Backend
- FastAPI

### AI Components
- YOLO
- SAM 2
- OCR
- LLM-based report interpretation

### Database
- PostgreSQL

### Storage
- Supabase Storage

## Stretch Features

- AI chat assistant
- Treatment cost estimation
- Dentist-ready export report
- Multi-language support
- Future risk prediction
- Appointment recommendations

## Final Goal

Create a personal Dental Digital Twin platform where users can visually explore their teeth, understand issues on a tooth-by-tooth basis, view supporting evidence from reports and photos, track oral health over time, and receive AI-powered insights through an interactive 3D experience.

### Tagline

**OralVerse — Create a living digital twin of your teeth using photos, reports, and AI-powered 3D reconstruction.**
