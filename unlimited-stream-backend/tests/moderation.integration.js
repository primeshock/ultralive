const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const http = require('node:http');
process.env.JWT_SECRET = 'isolated-moderation-test-only';
process.env.ROOM_SESSION_SECRET = 'isolated-room-test-only';
process.env.LIVEKIT_ENABLED = 'false';
const dbName = `codex_moderation_test_${Date.now()}`;
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Class = require('../src/models/Class');
const Enrollment = require('../src/models/ClassEnrollment');
const Moderation = require('../src/models/Moderation');
const service = require('../src/services/moderation');
const { signToken } = require('../src/utils/jwt');
// Ban side effects must never contact real streams from isolated tests.
require('../src/services/livekit').disconnectStudent = async () => {};
const express = require('express');
require('express-async-errors');
const app = express();
app.use(express.json(), require('cookie-parser')());
app.use('/api/admin', require('../src/routes/admin.routes'));
app.use('/api', require('../src/routes/phase2.routes'));
app.use((err, req, res, next) => { console.error(err.message); res.status(500).json({error:err.message}); });
let server;
let client;
function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, done); reject(new Error(`Timeout: ${name}`)); }, 4000);
    function done(value) { clearTimeout(timer); resolve(value); }
    socket.once(name, done);
  });
}
let count = 0;
async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/unlimited-stream', { dbName });
  const organizationId = new mongoose.Types.ObjectId();
  const owner = await User.create({username:'test_owner',passwordHash:'test',streamKey:'owner',role:'ORGANIZATION_OWNER',organizationId});
  const other = await User.create({username:'test_other',passwordHash:'test',streamKey:'other',role:'ADMIN_L1',organizationId:new mongoose.Types.ObjectId()});
  const account = await User.create({username:'student_login',passwordHash:'test',streamKey:'student',role:'STUDENT',organizationId});
  const student = await Student.create({externalId:'external-123',name:'Test Student',userId:account._id,organizationId});
  const cls = await Class.create({title:'Test Class',slug:'test_class',channel:'legacy_alias',ownerId:owner._id,organizationId});
  await Enrollment.create({classId:cls._id,studentId:student._id,organizationId,assignedBy:owner._id});
  server = http.createServer(app); require('../src/services/chat').initChat(server); await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method='GET', body, actor=owner) {
    const response = await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:`us_token=${signToken(String(actor._id))}`},body:body?JSON.stringify(body):undefined});
    const value = response.status===204?null:await response.json();
    assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(value)}`);
    return value;
  }
  function ok(label) { console.log(`PASS ${++count}: ${label}`); }
  const panel = `/api/classes/${cls._id}/moderation`;
  const chat = '/api/admin/channels/test_class/moderation';
  const { io } = require(require.resolve('socket.io-client', { paths: [process.env.FRONTEND_DIR || require('node:path').resolve(__dirname, '../../unlimited-stream-front')] }));
  client = io(base,{transports:['websocket'],autoConnect:false,reconnection:false,extraHeaders:{Cookie:`us_token=${signToken(String(account._id))}`}});
  let pending=event(client,'connect');client.connect();await pending;
  pending=event(client,'chat:history');client.emit('chat:join','test_class');await pending;
  pending=event(client,'chat:message');client.emit('chat:message',{channel:'test_class',text:'before mute'});
  assert.equal((await pending).externalUserId,student.externalId);ok('Actual chat messages use canonical student identity');
  let item = await request(panel,'POST',{studentId:student._id,type:'mute',scope:'permanent'});
  assert.ok(await service.active('test_class',student.externalId,'mute'));
  pending=event(client,'chat:error'); client.emit('chat:message',{channel:'test_class',text:'must be blocked'});
  assert.match((await pending).message,/سکوت/);
  assert.equal((await request(chat))[0]._id,item._id); ok('Class Panel mute is enforced and visible in Live Chat');
  await request(`/api/admin/moderation/${item._id}`,'DELETE');
  assert.equal(await service.active('test_class',student.externalId,'mute'),null); ok('Live Chat removes Class Panel mute');
  pending=event(client,'disconnect');
  item=await request(chat,'POST',{externalUserId:account.username,type:'ban',scope:'permanent'});
  await pending; ok('Ban disconnects the actual student socket');
  pending=event(client,'connect');client.connect();await pending;
  pending=event(client,'chat:error');client.emit('chat:join','test_class');assert.match((await pending).message,/محروم/);ok('Banned student cannot rejoin chat');
  assert.equal(item.externalUserId,student.externalId);
  assert.equal((await request(panel))[0]._id,item._id);
  const roster=await request(`/api/classes/${cls._id}/moderation-students`);
  assert.ok(roster.some(row=>row.externalId===student.externalId));
  assert.equal(await require('../src/utils/classAccess').canAccessClass('test_class',{us_token:signToken(String(account._id))}),false);
  ok('Chat username resolves to student; banned student remains listed and access is denied');
  const denied=await fetch(base+`/api/admin/moderation/${item._id}`,{method:'DELETE',headers:{Cookie:`us_token=${signToken(String(other._id))}`}});
  assert.equal(denied.status,403); ok('Another organization cannot remove restriction');
  await request(`${panel}/${item._id}`,'DELETE');
  assert.equal(await service.active('test_class',student.externalId,'ban'),null);
  assert.equal(await require('../src/utils/classAccess').canAccessClass('test_class',{us_token:signToken(String(account._id))}),true);
  pending=event(client,'chat:history');client.emit('chat:join','test_class');await pending;
  pending=event(client,'chat:message');client.emit('chat:message',{channel:'test_class',text:'after unban'});await pending;
  ok('Class Panel removes Chat ban and restores access and chat');
  const old=await Moderation.create({classId:cls._id,studentId:student._id,externalUserId:student.externalId,type:'mute',scope:'permanent',createdBy:String(owner._id)});
  await Moderation.create({channel:'legacy_alias',externalUserId:account.username,type:'mute',scope:'timed',expiresAt:new Date(Date.now()-1000),createdBy:String(owner._id)});
  assert.ok(await service.active('test_class',student.externalId,'mute'));
  await request(`/api/admin/moderation/${old._id}`,'DELETE');
  assert.equal(await service.active('test_class',student.externalId,'mute'),null); ok('Legacy class-only rows, aliases and duplicates can be removed together');
  item=await request(chat,'POST',{externalUserId:student.externalId,type:'mute',scope:'timed',minutes:1});
  await Moderation.updateOne({_id:item._id},{$set:{expiresAt:new Date(Date.now()-1000)}});
  assert.equal(await service.active('test_class',student.externalId,'mute'),null); ok('Timed restrictions expire');
  const invalid=await fetch(base+chat,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`us_token=${signToken(String(owner._id))}`},body:JSON.stringify({externalUserId:student.externalId,type:'ban',scope:'timed',minutes:-1})});
  assert.equal(invalid.status,400);ok('Invalid durations are rejected');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(client) client.disconnect();
  if(server) await new Promise(resolve=>server.close(resolve));
  if(mongoose.connection.name===dbName) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
