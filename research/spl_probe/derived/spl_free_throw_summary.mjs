// Derived data: MLSE SPL Open Data basketball free throw outcomes.
// Source raw JSON files were inspected from:
// https://github.com/mlsedigital/SPL-Open-Data/tree/main/basketball/freethrow/data/2024-08-28/P0001
// This compact layer keeps only trial-level outcome fields; raw tracking frames are not committed.

export const SPL_FREE_THROW_SOURCE = Object.freeze({
  dataset: 'MLSE SPL Open Data',
  sport: 'basketball',
  action: 'free throw',
  session: '2024-08-28',
  participant: 'P0001',
  sourceUrl: 'https://github.com/mlsedigital/SPL-Open-Data',
  readmeUrl: 'https://github.com/mlsedigital/SPL-Open-Data/tree/main/basketball/freethrow',
  rawPath: 'basketball/freethrow/data/2024-08-28/P0001',
  license: 'CC BY-NC-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  attribution: 'Data from Maple Leaf Sports & Entertainment Sport Performance Lab (SPL) Open Data.',
  coordinateNote: 'landing_x and landing_y are hoop-plane outcome coordinates in inches; landing_y uses the front of the hoop as origin.',
  scopeNote: 'Real non-professional participant outcomes from a compact 24-shot P0001 subset. Use as measured make/miss comparison, not as a pro/NBA generality claim.',
});

const samples = [
  { source_file: 'BB_FT_P0001_T0001.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0001', result: 'missed', landing_x: 7.15, landing_y: 12.755, entry_angle: 40.9, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0002.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0002', result: 'made', landing_x: -2.288, landing_y: 12.661, entry_angle: 43.97, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0003.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0003', result: 'missed', landing_x: 7.397, landing_y: 6.421, entry_angle: 41.5, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0004.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0004', result: 'missed', landing_x: -5.883, landing_y: 3.493, entry_angle: 46.66, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0005.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0005', result: 'made', landing_x: -0.641, landing_y: 8.974, entry_angle: 41.91, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0006.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0006', result: 'missed', landing_x: 5.134, landing_y: 4.814, entry_angle: 44.03, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0007.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0007', result: 'made', landing_x: -4.762, landing_y: 6.003, entry_angle: 42.95, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0008.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0008', result: 'made', landing_x: 2.093, landing_y: 15.484, entry_angle: 44.91, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0009.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0009', result: 'missed', landing_x: -9.07, landing_y: 15.269, entry_angle: 45.78, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0010.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0010', result: 'missed', landing_x: -2.616, landing_y: 2.686, entry_angle: 45.58, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0011.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0011', result: 'made', landing_x: -1.583, landing_y: 13.761, entry_angle: 45.03, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0012.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0012', result: 'made', landing_x: -0.779, landing_y: 8.292, entry_angle: 45.47, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0013.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0013', result: 'missed', landing_x: -3.147, landing_y: 16.285, entry_angle: 42.36, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0014.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0014', result: 'missed', landing_x: 9.323, landing_y: 4.408, entry_angle: 40.25, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0015.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0015', result: 'missed', landing_x: 5.461, landing_y: 3.517, entry_angle: 42.79, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0016.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0016', result: 'missed', landing_x: -7.265, landing_y: 17.367, entry_angle: 45.67, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0017.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0017', result: 'missed', landing_x: 6.541, landing_y: 15.45, entry_angle: 47.06, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0018.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0018', result: 'missed', landing_x: -7.388, landing_y: 13.795, entry_angle: 44.44, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0019.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0019', result: 'made', landing_x: 0.27, landing_y: 11.552, entry_angle: 42.39, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0020.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0020', result: 'made', landing_x: 0.13, landing_y: 4.894, entry_angle: 37.96, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0021.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0021', result: 'made', landing_x: 5.55, landing_y: 11.414, entry_angle: 43.01, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0022.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0022', result: 'made', landing_x: -0.198, landing_y: 15.542, entry_angle: 42.93, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0023.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0023', result: 'made', landing_x: 1.597, landing_y: 6.537, entry_angle: 43.38, tracking_frames: 240 },
  { source_file: 'BB_FT_P0001_T0024.json', sampling_rate: 30, trial_date: '2024-08-28', participant_id: 'P0001', trial_id: 'T0024', result: 'made', landing_x: -1.855, landing_y: 11.935, entry_angle: 47.43, tracking_frames: 240 },
];

export const SPL_FREE_THROW_SAMPLES = Object.freeze(samples.map((sample) => Object.freeze(sample)));

export const SPL_FREE_THROW_SUMMARY = Object.freeze({
  source: SPL_FREE_THROW_SOURCE,
  samples: SPL_FREE_THROW_SAMPLES,
});
