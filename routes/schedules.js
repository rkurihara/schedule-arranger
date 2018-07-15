'use strict';
const expreess = require('express');
const router = expreess.Router();
const authenticationEnsurer = require('./authentication-ensurer');
const uuid = require('node-uuid');
const Schedule = require('../models/schedule');
const Candidate = require('../models/candidate');
const User = require('../models/user');
const Availability = require('../models/availability');
const Comment = require('../models/comment');
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

router.get('/new', authenticationEnsurer, csrfProtection, (req, res, next) => {
  res.render('new', { user: req.user, csrfToken: req.csrfToken() });
});

router.post('/', authenticationEnsurer, csrfProtection, (req, res, next) => {
  const scheduleId = uuid.v4();
  const updatedAt = new Date();
  Schedule.create({
    scheduleId: scheduleId,
    scheduleName: req.body.scheduleName.slice(0, 255),
    memo: req.body.memo,
    createdBy: req.user.id,
    updatedAt: updatedAt
  }).then((schedule) => {
    createCandidatesAndRedirect(parseCandidateName(req), schedule.scheduleId, res);
  });
});

router.get('/:scheduleId', authenticationEnsurer, (req, res, next) => {
  let storedSchedule = null;
  let storedCandidates = null;
  Schedule.findOne({
    include: [
      {
        model: User,
        attributes: ['userId', 'username']
      }
    ],
    where: {
      scheduleId: req.params.scheduleId
    },
    order: '"updatedAt" DESC'
  }).then((schedule) => {
    if (schedule) {
      storedSchedule = schedule;
      return Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: '"candidateId" ASC'
      });
    } else {
      const err = new Error('指定された予定は見つかりません');
      err.status = 404;
      next(err);
    }
  }).then((candidates) => {
    // データベースからその予定のすべての出欠を取得する
    storedCandidates = candidates;
    return Availability.findAll({
      include: [
        {
          model: User,
          attributes: ['userId', 'username']
        }
      ],
      where: { scheduleId: storedSchedule.scheduleId },
      order: '"user.username" ASC, "candidateId" ASC'
    });
  }).then((availabilities) => {
    // 出欠 MapMap(キー:ユーザID, 値:出欠Map(キー:候補ID, 値:出欠)) を作成する
    const availabilityMapMap = new Map(); // key: userId, value: Map(key: candidateId, availability)
    availabilities.forEach((a) => {
      const map = availabilityMapMap.get(a.user.userId) || new Map();
      map.set(a.candidateId, a.availability);
      availabilityMapMap.set(a.user.userId, map);
    });

    // 閲覧ユーザーと出欠に紐づくユーザーからユーザー Map (キー:ユーザー ID, 値:ユーザー) を作る
    const userMap = new Map(); // key: userId, value: User
    userMap.set(parseInt(req.user.id), {
      isSelf: true,
      userId: parseInt(req.user.id),
      username: req.user.username
    });
    availabilities.forEach((a) => {
      userMap.set(a.user.userId, {
        isSelf: parseInt(req.user.id) === a.user.userId, // 閲覧ユーザー自身であるかを含める
        userId: a.user.userId,
        username: a.user.username
      });
    });

    // 全ユーザー、全候補で二重ループしてそれぞれの出欠の値がない場合には、「欠席」を設定する
    const users = Array.from(userMap).map((keyValue) => keyValue[1]);
    users.forEach((u) => {
      storedCandidates.forEach((c) => {
        const map = availabilityMapMap.get(u.userId) || new Map();
        const a = map.get(c.candidateId) || 0; // デフォルト値は0
        map.set(c.candidateId, a);
        availabilityMapMap.set(u.userId, map);
      });
    });

    //コメント取得
    Comment.findAll({
      where: { scheduleId: storedSchedule.scheduleId }
    }).then((comments) => {
      const commentMap = new Map(); // key: userId, value: comment
      comments.forEach((comment) => {
        commentMap.set(comment.userId, comment.comment);
      });
      res.render('schedule', {
        user: req.user,
        schedule: storedSchedule,
        candidates: storedCandidates,
        users: users,
        availabilityMapMap: availabilityMapMap,
        commentMap: commentMap
      });
    });
  });
});

router.get('/:scheduleId/edit', authenticationEnsurer, csrfProtection, (req, res, next) => {
  Schedule.findOne({
    where: {
      scheduleId: req.params.scheduleId
    }
  }).then((schedule) => {
    if (isMine(req, schedule)) {
      Candidate.findAll({
        where: { scheduleId: schedule.scheduleId },
        order: '"candidateId" ASC'
      }).then((candidates) => {
        res.render('edit', {
          user: req.user,
          schedule: schedule,
          candidates: candidates,
          csrfToken: req.csrfToken()
        });
      });
    } else {
      const err = new Error('指定された予定がない、または、予定する権限がありません')
      err.status = 404;
      next(err);
    }
  });
});

router.post('/:scheduleId', authenticationEnsurer, csrfProtection, (req, res, next) => {
  if (parseInt(req.query.edit) === 1) {
    Schedule.findOne({
      where: {
        scheduleId: req.params.scheduleId
      }
    }).then((schedule) => {
      if (isMine(req, schedule)) {
        const updatedAt = new Date();
        schedule.update({
          scheduleId: schedule.scheduleId,
          scheduleName: req.body.scheduleName.slice(0, 255),
          memo: req.body.memo,
          createdBy: req.user.id,
          updatedAt: updatedAt
        }).then((schedule) => {
          Candidate.findAll({
            where: { scheduleId: schedule.scheduleId },
            order: '"candidateId" ASC'
          }).then((candidates) => {
            const candidateNames = parseCandidateName(req);
            if (candidateNames) {
              createCandidatesAndRedirect(candidateNames, schedule.scheduleId, res);
            } else {
              res.redirect('/schedules/' + schedule.scheduleId);
            }
          });
        });
      } else {
        const err = new Error('指定された予定がない、または、編集する権限がありません')
        err.status = 404;
        next(err);
      }
    });
  } else if (parseInt(req.query.delete) === 1) {
    deleteScheduleAggregate(req.params.scheduleId, () => {
      res.redirect('/');
    });
  } else {
    const err = new Error('不正なリクエストです');
    err.status = 400;
    next(err);
  }
});

function createCandidatesAndRedirect(candidateNames, scheduleId, res) {
  const candidates = candidateNames.map((c) => {
    return {
      candidateName: c,
      scheduleId: scheduleId
    };
  });
  Candidate.bulkCreate(candidates).then(() => {
    res.redirect('/schedules/' + scheduleId);
  });
}

function parseCandidateName(req) {
  return req.body.candidates.trim().split('\n').map((s) => s.trim());
}

function isMine(req, schedule) {
  return schedule && parseInt(schedule.createdBy) === parseInt(req.user.id);
}

function deleteScheduleAggregate(scheduleId, done, err) {
  const promiseCommentDestroy = Comment.findAll({
    where: { scheduleId: scheduleId }
  }).then((comments) => {
    return Promise.all(comments.map((c) => { return c.destroy(); }));
  });

  Availability.findAll({
    where: { scheduleId: scheduleId }
  }).then((availabilities) => {
    const promises = availabilities.map((a) => { return a.destroy(); });
    return Promise.all(promises);
  }).then(() => {
    return Candidate.findAll({
      where: { scheduleId: scheduleId }
    });
  }).then((candidates) => {
    const promises = candidates.map((c) => { return c.destroy(); });
    promises.push(promiseCommentDestroy);
    return Promise.all(promises);
  }).then(() => {
    return Schedule.findById(scheduleId).then((s) => { s.destroy(); });
  }).then(() => {
    if (err) return done(err);
    done();
  });
}

router.deleteScheduleAggregate = deleteScheduleAggregate
module.exports = router;