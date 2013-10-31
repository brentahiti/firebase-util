
var expect = require('chai').expect;
var fb = require('../firebase-utils.js')._ForTestingOnly;
var helpers = require('./util/test-helpers.js');
var data = require('./util/data.join.json');
var Firebase = require('firebase');

describe('join.JoinedRecord', function() {
   var JoinedRecord = fb.join.JoinedRecord;

   beforeEach(function(done){
      helpers.reset(data, done);
   });

   afterEach(helpers.unauth);

   describe('<constructor>', function() {
      it('should throw an error if there are no Firebase refs (cannot all be dynamic functions)', function() {
         expect(function() {
            new JoinedRecord({ref: function() {}, keyMap: { hello: 'world' }, pathName: 'test'});
         }).to.throw(Error, /no valid Firebase/i);
      });

      it('should throw an error if passed a dynamic ref and there is no pathName', function() {
         expect(function() {
            new JoinedRecord({ref: function() {}, keyMap: { foo: 'bar' }});
         }).to.throw(Error, /pathName/);
      });

      it('should throw an error if passed a dynamic ref and there is no keyMap', function() {
         expect(function() {
            new JoinedRecord({ref: function() {}, pathName: 'test'});
         }).to.throw(Error, /keyMap/);
      });
   });

   describe('#auth', function() {
      it('should invoke callback with err if not successful', function(done) {
         new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).auth('not a valid secret', function(err, auth) {
            expect(err).to.exist;
            done();
         });
      });

      it('should succeed with a valid token', function(done) {
         new JoinedRecord(helpers.ref('unions/fruit')).auth(helpers.tok('test-user'), function(err) {
            expect(err).not.to.exist;
            done();
         });
      });

      it('should cause .info/authenticated to be true', function(done) {
         new JoinedRecord(helpers.ref('unions/fruit')).auth(helpers.tok('test-user'), function() {
            helpers.chain()
               .get('.info/authenticated')
               .then(function(v) {
                  expect(v).to.be.true;
               })
               .testDone(done);
         });
      });
   });

   describe('#unauth', function() {
      it('should cause .info/authenticated to become false', function(done) {
         helpers.chain()
            .auth('test-user')
            .get('.info/authenticated')
            .then(function(v) {
               expect(v).to.be.true;
               new JoinedRecord(helpers.ref('unions/fruit')).unauth();
            })
            .get('.info/authenticated')
            .then(function(v) {
               expect(v).to.be.false;
            })
            .testDone(done);
      });
   });

   describe('#on', function() {
      it('should return a JoinedSnapshot on parent', function(done) {
         new JoinedRecord(helpers.ref('account/kato')).on('value', function(snap) {
            snap.ref().off();
            expect(snap).to.be.instanceof(fb.join.JoinedSnapshot);
            done();
         });
      });

      it('should merge data in order paths were added', function(done) {
         new JoinedRecord(helpers.ref('account'), helpers.ref('profile')).on('value', function(snap) {
            snap.ref().off();
            expect(snap.val()).to.eql({
               "bruce": {
                  "email": "bruce@lee.com",
                  "name": "Bruce Lee",
                  "nick": "Little Phoenix",
                  "style": "Jeet Kune Do"
               },
               "kato": {
                  "email": "wulf@firebase.com",
                  "name": "Michael Wulf",
                  "nick": "Kato",
                  "style": "Kung Fu"
               }
            });
            done();
         });
      });

      it('should put primitives into field named by path', function(done) {
         new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).on('value', function(snap) {
            snap.ref().off();
            expect(snap.val()).to.eql({
               a: { fruit: "apple" },
               b: { fruit: "banana", legume: "baked beans" },
               c: { legume: "chickpeas" },
               d: { legume: "dry-roasted peanuts" }
            });
            done();
         });
      });

      it('If keyMap specified, should put primitives into that field', function(done) {
         new JoinedRecord(
            {ref: helpers.ref('unions/fruit'), keyMap: {'.value': 'フルーツ'}},
            helpers.ref('unions/legume')
         ).on('value', function(snap) {
            snap.ref().off();
            expect(snap.val()).to.eql({
               a: { 'フルーツ': "apple" },
               b: { 'フルーツ': "banana", legume: "baked beans" },
               c: { legume: "chickpeas" },
               d: { legume: "dry-roasted peanuts" }
            });
            done();
         });
      });

      //todo-test
      it.skip('should call "child_added" for all pre-loaded recs', function(done) {
         var keys;
         var rec = new JoinedRecord(helpers.ref('account'), helpers.ref('profile'));

         function fn(snap) {
            expect(snap.name()).to.equal(keys.shift());
            keys.length === 0 && done();
         }

         fb.log('_____________?');//debug
         rec.once('value', function(snap) {
            fb.log('child_added__________');//debug
            keys = fb.util.keys(snap.val());
            // wait for the recs to load, then try child_added against them
            rec.on('child_added', fn);
         });
      });

      it('should call "value" on a child_added event', function(done) {
         function setVal(snap) {
            expect(snap.val()).to.eql({
               "bruce": {
                  "email": "bruce@lee.com",
                  "name": "Bruce Lee",
                  "nick": "Little Phoenix",
                  "style": "Jeet Kune Do"
               },
               "kato": {
                  "email": "wulf@firebase.com",
                  "name": "Michael Wulf",
                  "nick": "Kato",
                  "style": "Kung Fu"
               }
            });
            step = verify;
            helpers.ref('account/john').set({name: 'john', email: 'john@john.com'});
         }

         function verify(snap) {
            snap.ref().off();
            expect(snap.val()).to.eql({
               "bruce": {
                  "email": "bruce@lee.com",
                  "name": "Bruce Lee",
                  "nick": "Little Phoenix",
                  "style": "Jeet Kune Do"
               },
               "kato": {
                  "email": "wulf@firebase.com",
                  "name": "Michael Wulf",
                  "nick": "Kato",
                  "style": "Kung Fu"
               },
               "john": {
                  // the name will lose out to the profile path (which has none)
                  // so all we get is an email
                  "email": "john@john.com"
               }
            });
            done();
         }

         var step = setVal;

         new JoinedRecord(helpers.ref('account'), helpers.ref('profile'))
            .on('value', function(snap) {
               // the first time this is called with empty callback to skip the pre-add notification
               step(snap);
            });
      });

      it('should call "value" on a child_removed event');

      it('should call "value" on a child_changed event');

      it('should call "value" on a child_moved event');

      it('should be union if no intersecting paths are declared');

      it('should not call child_added until all intersecting paths exist');

      it('should call child_removed if any intersecting paths is removed');

      it('should call child_added for any preloaded records when on() is declared');

      it('should not call child_removed until last path is removed if a union');

      it('should accept a single path');

      it('should accept paths that don\'t exist (that just return null)');

      it('should return null if any intersecting path is null if joined parent');

      it('should return null if any intersecting path is null if joined child');

      it('should return only children in all intersecting paths');

      it('should merge data from a dynamic path (function)');

      it('should sort data according to first sortBy path');

      it('should invoke the cancel callback for all listeners if canceled');

      it('should work with only child_added callback');

      it('should work with only child_changed callback');

      it('should work with only child_removed callback');

      it('should work with only child_moved callback');

      it('should return a regular snap if called on child');

      it('should work with "value" if called on child');

      it('should work with "child_added" if called on child');

      it('should work with "child_removed" if called on child');

      it('should work with "child_changed" if called on child');

      it('should work with "child_moved" if called on child');

      it('should not behave unexpectedly if add followed immediately by remove event');
   });

   describe('#off', function() {
      it('should remove a specific listener if given a function and context');

      it('should remove all listeners on a given event if no function');

      it('should should remove all listeners if no arguments');
  });

   describe('#once', function() {
      it('should return a JoinedSnapshot', function(done) {
         new JoinedRecord(helpers.ref('account'), helpers.ref('profile')).once('value', function(snap) {
            expect(snap).to.be.instanceof(fb.join.JoinedSnapshot);
            done();
         });
      });

      it('should work if called when value is already cached', function(done) {
         var rec = new JoinedRecord(helpers.ref('account'), helpers.ref('profile'));
         rec.once('value', function(snap1) {
            rec.once('value', function(snap2) {
               expect(snap2.val()).to.eql(snap1.val());
               done();
            })
         });
      });

      it('should get called exactly one time', function(done){
         var ct = 0, adds = 0;
         var rec = new JoinedRecord(helpers.ref('account'), helpers.ref('profile'));
         rec.once('value', function() { ct++; });

         function next() {
            if( ++adds === 3 ) {
               setTimeout(function() {
                  expect(ct).to.equal(1);
                  done();
               }, 100);
            }
         }

         helpers.set('account/john', {email: 'john@john.com'}).then(next);
         helpers.set('account/mandy', {email: 'mandy@mandy.com'}).then(next);
         helpers.set('account/mary', {email: 'mary@mary.com'}).then(next);

      });

      it('should return a regular snap at the right child path if called on a child', function() {
         new JoinedRecord(helpers.ref('account'), helpers.ref('profile'))
            .child('kato/name').once('value', function(snap) {
               expect(snap.ref()).to.be.instanceOf(Firebase);
               expect(snap.name()).to.equal('name');
               expect(snap.ref().parent().parent().name()).to.equal('profile');
               expect(snap.val()).to.equal('Michael Wulf');
            })
      });

      it('should work for "value"', function(done) {
         new JoinedRecord(helpers.ref('account'), helpers.ref('profile'))
            .once('value', function(snap) {
               expect(snap.val()).to.eql({
                  "bruce": {
                     "email": "bruce@lee.com",
                     "name": "Bruce Lee",
                     "nick": "Little Phoenix",
                     "style": "Jeet Kune Do"
                  },
                  "kato": {
                     "email": "wulf@firebase.com",
                     "name": "Michael Wulf",
                     "nick": "Kato",
                     "style": "Kung Fu"
                  }
               });
               done();
            });
      });

      it('should work for "child_added"', function(done) {
         new JoinedRecord(helpers.ref('account'), helpers.ref('profile'))
            .once('child_added', function(snap) {
               expect(snap.name()).to.equal('bruce');
               done();
            });
      });

      it('should work for "child_removed"', function(done) {
         var rec = new JoinedRecord(helpers.ref('account'), helpers.ref('profile'));
         rec.once('child_removed', function(snap) {
               expect(snap.name()).to.equal('bruce');
               done();
            });
         rec.once('value', function() {
            helpers.ref('account/bruce').remove();
            helpers.ref('profile/bruce').remove();
         });
      });

      it('should work for "child_changed"', function(done) {
         new JoinedRecord(helpers.ref('account'), helpers.ref('profile'))
            .once('child_changed', function(snap) {
               expect(snap.name()).to.equal('bruce');
               done();
            });
         helpers.ref('account/bruce/email').set('brucie@wushu.com');
      });

      it('should work for "child_moved"');

      it('should load dynamic paths');
  });

   describe('#child', function() {
      it('should be tested');
  });

   describe('#parent', function() {
      it('should be tested');
  });

   describe('#name', function() {
      it('should be tested');
  });

   describe('#set', function() {
      it('should be tested');
  });

   describe('#setWithPriority', function() {
      it('should be tested');
  });

   describe('#setPriority', function() {
      it('should be tested');
  });

   describe('#update', function() {
      it('should be tested');
  });

   describe('#remove', function() {
      it('should remove record from all joined paths');

      it('should not blow up if record does not exist');

      it('should trigger "child_moved" on next record');

      it('should work with dynamic paths');
  });

   describe('#push', function() {
      it('should be tested');
  });

   describe('#root', function() {
      it('should be tested');
  });

   describe('#toString', function() {
      it('should be tested');
  });

   describe('#ref', function() {
      it('should be tested');
  });

   describe('#onDisconnect', function() {
      it('should throw a NotSupportedError', function() {
         expect(function() {
            new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).onDisconnect();
         }).to.throw(fb.NotSupportedError);
      });
  });

   describe('#limit', function() {
      it('should throw a NotSupportedError', function() {
         expect(function() {
            new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).limit();
         }).to.throw(fb.NotSupportedError);
      });
  });

   describe('#endAt', function() {
      it('should throw a NotSupportedError', function() {
         expect(function() {
            new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).endAt();
         }).to.throw(fb.NotSupportedError);
      });
  });

   describe('#startAt', function() {
      it('should throw a NotSupportedError', function() {
         expect(function() {
            new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).startAt();
         }).to.throw(fb.NotSupportedError);
      });
  });

   describe('#transaction', function() {
      it('should throw a NotSupportedError', function() {
         expect(function() {
            new JoinedRecord(helpers.ref('unions/fruit'), helpers.ref('unions/legume')).transaction();
         }).to.throw(fb.NotSupportedError);
      });
  });

});