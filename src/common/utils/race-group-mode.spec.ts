import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  refreshGroupModeCourseSnapshots,
  resolveCourseIdForGroup,
  resolveCourseSnapshotForGroup,
  resolveScheduledStartAtForGroup,
  resolveStartedAtForGroup,
} from './race-group-mode';

const raceWithPerGroupCourses = {
  courseId: 'course-a',
  courseSnapshot: { id: 'course-a', checkpoints: [{ kind: 'start' }] },
  raceState: {
    groupMode: {
      sameCourse: false,
      sameStart: false,
      groups: [
        {
          groupId: 'g1',
          groupName: 'A',
          courseId: 'course-a',
          courseSnapshot: { id: 'course-a', checkpoints: [{ kind: 'start' }, { kind: 'finish' }] },
          scheduledStartAt: '2026-11-14T10:00:00.000Z',
          startedAt: '2026-11-14T10:05:00.000Z',
        },
        {
          groupId: 'g2',
          groupName: 'B',
          courseId: 'course-b',
          courseSnapshot: { id: 'course-b', checkpoints: [{ kind: 'start' }, { kind: 'buoy' }, { kind: 'finish' }] },
          scheduledStartAt: '2026-11-14T10:20:00.000Z',
          startedAt: null,
        },
      ],
    },
  },
};

describe('race-group-mode course/start resolution', () => {
  it('returns each group course id and snapshot when sameCourse=false', () => {
    assert.equal(resolveCourseIdForGroup(raceWithPerGroupCourses, 'g2'), 'course-b');
    assert.equal(
      (resolveCourseSnapshotForGroup(raceWithPerGroupCourses, 'g2') as { id: string }).id,
      'course-b',
    );
    assert.equal(resolveCourseIdForGroup(raceWithPerGroupCourses, 'g1'), 'course-a');
  });

  it('falls back to race course when group is missing or sameCourse', () => {
    assert.equal(resolveCourseIdForGroup(raceWithPerGroupCourses, 'unknown'), 'course-a');
    assert.equal(
      resolveCourseIdForGroup(
        {
          ...raceWithPerGroupCourses,
          raceState: {
            groupMode: {
              ...raceWithPerGroupCourses.raceState.groupMode,
              sameCourse: true,
            },
          },
        },
        'g2',
      ),
      'course-a',
    );
  });

  it('returns per-group scheduled/started times when sameStart=false', () => {
    assert.equal(
      resolveScheduledStartAtForGroup(raceWithPerGroupCourses.raceState, 'g2'),
      '2026-11-14T10:20:00.000Z',
    );
    assert.equal(
      resolveStartedAtForGroup(raceWithPerGroupCourses.raceState, 'g1'),
      '2026-11-14T10:05:00.000Z',
    );
    assert.equal(resolveStartedAtForGroup(raceWithPerGroupCourses.raceState, 'g2'), null);
  });

  it('refreshes only matching group course snapshots', () => {
    const next = refreshGroupModeCourseSnapshots(
      raceWithPerGroupCourses.raceState,
      'course-b',
      { id: 'course-b', checkpoints: [{ kind: 'start' }] },
    );
    assert.ok(next);
    assert.equal((next!.groups[1].courseSnapshot as { id: string }).id, 'course-b');
    assert.equal(
      (next!.groups[0].courseSnapshot as { id: string }).id,
      'course-a',
    );
  });
});
