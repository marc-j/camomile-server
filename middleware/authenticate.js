/*
The MIT License (MIT)

Copyright (c) 2013-2014 CNRS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/


var hash = require('./pass').hash,
    User = require('../models/user').User,
    ACLModel = require('../models/ACL').ACL,
    ACL = require('../controllers/ACLAPI'),
    Group = require('../models/Group').Group,
    GroupAPI = require('../controllers/GroupAPI'),
    commonFuncs = require('../lib/commonFuncs'),
    mongoose = require('mongoose'),
    ses = require('../models/sessions')(mongoose); //for listing all sessions

var corpus = require('../controllers/CorpusAPI'),
  	media = require('../controllers/MediaAPI'),
  	layer = require('../controllers/LayerAPI'),
  	anno = require('../controllers/AnnotationAPI'),
  	compound = require('../controllers/CompoundAPI');

// check for authentication
authenticateElem = function(name, pass, fn) {
    User.findOne({username: name}, function (err, user) {
       	if (user) {
           	if (err)  return fn(new Error('could not find user'));
           	hash(pass, user.salt, function (err, hash) {
            	if (err) return fn(err);
            	if (hash == user.hash) return fn(null, user);
            	fn(new Error('invalid password'));
           	});
       	} 
       	else return fn(new Error('could not find this user'));
    }); 
}

exports.authenticate = function(name, pass, fn) {
    return authenticateElem(name, pass, fn);
}

exports.requiredValidUser = function(req, res, next) {
	if(req.session.user) next();
	else res.send(403, '{"error":"access denied"}');
}

// check if the given user name or group name exists
exports.requiredRightUGname = function(role) {
	return function(req, res, next) {
    	if(req.session.user) { 
    		if(req.session.user.role == "admin") next();
			else if(commonFuncs.isAllowedUser(req.session.user.role, role) < 0) res.send(403, '{"error":"access denied"}');
			else {
				var userLogin = req.body.username;
				var groupLogin = req.body.groupname;
				if(userLogin == undefined) userLogin = "root";
				User.findOne({username : {$regex : new RegExp('^'+ userLogin + '$', "i")}}, function(error, data){
					if(error) res.send(403, '{"error":"access denied"}');
					else {
						if(data == null) res.send(400, '{"error":"this user does not exist"}');
						else {
							if(groupLogin == undefined) next();
							else {
								Group.findOne({groupname : {$regex : new RegExp('^'+ groupLogin + '$', "i")}}, function(error, data){
									if(error) res.send(403, '{"error":"access denied"}');
									else {
										if(data == null)res.send(400, '{"error":"this group does not exist"}');
										else next();
									}
								});
							}
						}
					}
				});
			}
		}
		else res.send(403, '{"error":"access denied"}');
	}
}

// check if the IDs given for an operation are consistent, 
// ie., id_layer is under its id_media, ...
exports.requiredConsistentID = function(role, minimumRightRequired, level) {
	return function(req, res, next) {
		if(req.session.user) { 
    		if(req.session.user.role == "admin" || minimumRightRequired == 'N') next();
		else if(commonFuncs.isAllowedUser(req.session.user.role, role) < 0) res.send(403, '{"error":"access denied"}');
		else {
			switch(level){
				case "corpus":
					var id_corpus = req.params.id;
					if(id_corpus == undefined) id_corpus = req.params.id_corpus;
					Corpus.findById(id_corpus, function(error, data){
						if(error) res.send(403, '{"error":"access denied"}');
						else if(data == null) res.send(403, '{"error":"access denied"}');
						else next();
					});
					break;
					
				case "media":
					Media.findById(req.params.id_media, function(error, data){
						if(error) res.send(403, '{"error":"access denied!"}');
						else if(data == null) res.send(400, '{"error":"Not found this id"}');
						else if(req.params.id_corpus == data.id_corpus)  next();
						else res.send(400, '{"error":"One of these ids is not correct"}');
					});						
					break;
					
				case "layer":
					Layer.findById(req.params.id_layer, function(error, data){
						if(error) res.send(403, '{"error":"access denied!"}');
						else if(data == null) res.send(400, '{"error":"Not found this id"}');
						else if(data.id_media != req.params.id_media)  res.send(400, '{"error":"One of these ids is not correct"}');
						else {
							Media.findById(req.params.id_media, function(error, data1){
								if(error) res.send(403, '{"error":"access denied!"}');
								else if(data1 == null) res.send(400, '{"error":"Not found this id"}');
								else if(req.params.id_corpus == data1.id_corpus) next();
								else res.send(400, '{"error":"One of these ids is not correct"}');
							});
						}
					});
					break;
				
				case "annotation":
					Annotation.findById(req.params.id_anno, function(error, dat){
						if(error)res.send(403, '{"error":"access denied!"}');
						else if(dat == null) res.send(400, '{"error":"Not found this id"}');
						else if(dat.id_layer != req.params.id_layer) res.send(400, '{"error":"One of these ids is not correct"}');
						else {
							Layer.findById(req.params.id_layer, function(error, data){
								if(error) res.send(403, '{"error":"access denied!"}');
								else if(data == null) res.send(400, '{"error":"Not found this id"}');
								else if(data.id_media != req.params.id_media)  res.send(400, '{"error":"One of these ids is not correct"}');
								else {
									Media.findById(req.params.id_media, function(error, data1){
										if(error) res.send(403, '{"error":"access denied!"}');
										else if(data1 == null) res.send(400, '{"error":"Not found this id"}');
										else if(req.params.id_corpus == data1.id_corpus) next();
										else res.send(400, '{"error":"One of these ids is not correct"}');
									});
								}
							});		
						}
					});
					break;
					
				default:
					break;
				}	
			}
		}
	}
}


exports.requiredAuthentication = function(role, minimumRightRequired, level) {
	return function(req, res, next) {
		if(req.session.user) { 
    		if(req.session.user.role == "admin" || minimumRightRequired == 'N')  next();
			else if(commonFuncs.isAllowedUser(req.session.user.role, role) < 0)	 res.send(403, '{"error":"access denied"}');
			else {
				var connectedUser = req.session.user;
				var i = level;
				var found = false;
				switch(i) {
					case "annotation": 
						Group.find({'usersList' : {$regex : new RegExp('^'+ connectedUser.username + '$', "i")}}, function(error, dataGroup) {
							if(error)  throw error;
							else {
								result = [];
								result.push(req.params.id_anno);
								result.push(req.params.id_layer);
								result.push(req.params.id_media);
								result.push(req.params.id_corpus);
								ACLModel.find({id:{$in:result}}, function(error, dataACL) {
									if(error) res.send(404, '{"error":"'+error+'"}');
									else if(dataACL != null) {
										var contd = true;
										for(var i = 0; i < dataACL.length && contd; i++){
											var foundPos = commonFuncs.findUsernameInACL(connectedUser.username, dataACL[i].users);
											if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL[i].users[foundPos].right) >= 0) {
												found = true; 
												contd = false;
												next();
											}	
											else {
												foundPos = commonFuncs.findUsernameInGroupACL(dataGroup, dataACL[i].groups);
												if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL[i].groups[foundPos].right) >= 0) {
													found = true; 
													contd = false; 
													next(); 
												}
											}
											if(foundPos != -1 && contd)  contd = false;  // found the user right, but not satisfied
										} 
										if(found == false)  res.send(403, '{"error":"access denied"}');
									}
									else  res.send(403, '{"error":"access denied"}'); 
								});
							}
						});	
						break;
						
					case  "layer": 
						Group.find({'usersList' : {$regex : new RegExp('^'+ connectedUser.username + '$', "i")}}, function(error, dataGroup) {
							if(error) throw error;
							else {
								result = [];
								result.push(req.params.id_layer);
								result.push(req.params.id_media);
								result.push(req.params.id_corpus);
								ACLModel.find({id:{$in:result}}, function(error, dataACL) {
									if(error) res.send(404, '{"error":"'+error+'"}');
									else if(dataACL != null) {
										var contd = true;
										for(var i = 0; i < dataACL.length && contd; i++){
											var foundPos = commonFuncs.findUsernameInACL(connectedUser.username, dataACL[i].users);
											if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL[i].users[foundPos].right) >= 0) {
												contd = false; 
												found = true;
												next();
											}	
											else {
												foundPos = commonFuncs.findUsernameInGroupACL(dataGroup, dataACL[i].groups);
												if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL[i].groups[foundPos].right) >= 0) { 
													found = true; 
													contd = false; 
													next(); 
												}
											}
											if(foundPos != -1 && contd) contd = false;  // found the user right, but not satisfied
										} 
										if(found == false) res.send(403, '{"error":"access denied"}');
									}
									else res.send(403, '{"error":"access denied"}');
								});
							}
						});	
						break;
						
					case "media": 
						var id_media = req.params.id_media;
						Group.find({'usersList' : {$regex : new RegExp('^'+ connectedUser.username + '$', "i")}}, function(error, dataGroup) {
							if(error) throw error;
							else {
								result = [];
								result.push(req.params.id_media);
								result.push(req.params.id_corpus);
								ACLModel.find({id:{$in:result}}, function(error, dataACL) {
									if(error)  throw error;
									else if(dataACL != null) {
										var contd = true;
											for(var i = 0; i < dataACL.length && contd; i++){
											var foundPos = commonFuncs.findUsernameInACL(connectedUser.username, dataACL[i].users);
											if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL[i].users[foundPos].right) >= 0) {
												contd = false; 
												found = true;
												next();
											}	
											else {
												foundPos = commonFuncs.findUsernameInGroupACL(dataGroup, dataACL[i].groups);
												if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL[i].groups[foundPos].right) >= 0) {
													found = true; 
													contd = false; 
													next(); 
												}
											}
											if(foundPos != -1 && contd) contd = false;  // found the user right, but not satisfied
										} 
										if(found == false) res.send(403, '{"error":"access denied"}');
									}
									else res.send(403, '{"error":"access denied"}');
								});
							}
						});
						break;
						
					case "corpus": 
						var id_corpus = req.params.id;
						if(id_corpus == undefined) id_corpus = req.params.id_corpus;
						
						Group.find({'usersList' : {$regex : new RegExp('^'+ connectedUser.username + '$', "i")}}, function(error, dataGroup) {
							if(error) throw error;
							else {									
								ACLModel.findOne({id:id_corpus}, function(error, dataACL) {
									if(error) throw error;
									else if(dataACL != null) {										
										var foundPos = commonFuncs.findUsernameInACL(connectedUser.username, dataACL.users);
										if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL.users[foundPos].right) >= 0) {
											found = true;
											next();
										}	
										else {
											foundPos = commonFuncs.findUsernameInGroupACL(dataGroup, dataACL.groups);
											if(foundPos != -1 && commonFuncs.isAllowedRight(minimumRightRequired, dataACL.groups[foundPos].right) >= 0) {
												found = true; 
												next();
											}
										}
										if(found == false) res.send(403, '{"error":"access denied"}');
									}
									else res.send(403, '{"error":"access denied"}');
								});
							}
						});
					break;
					
					case "global":						
						if(commonFuncs.isAllowedUser(req.session.user.role, role) >= 0)	next();
						else res.send(403, '{"error":"access denied"}');
						break;
						
					default:
						res.send(403, '{"error":"access denied"}');					//keep only the permitted resources
				}
			}  
		} 
		else {
			res.send(403, '{"error":"access denied"}');	
		}	
	}
}

// create a root user if it does not exist
exports.createRootUser = function(){
	User.findOne({username:"root"}, function(err, data){
   		if(err) throw err;
   		if(!data) {
   			var pass = GLOBAL.root_pass;
   			
			hash(pass, function (err, salt, hash) {
				if (err) throw err;
				var user = new User({
					username: "root",
					affiliation: "camomile",
					role: "admin",
					salt: salt,
					hash: hash,
				}).save(function (err, newUser) {  // already added the root user
					if (err) throw err;
				}); 
			});	
   		} 
   		else if(GLOBAL.root_passdef != GLOBAL.root_pass){
   			var pass = GLOBAL.root_pass;
			hash(pass, function (err, salt, hash) {
				data.salt = salt;
				data.hash = hash;
				data.save(function (err, newUser) {  // already updated the root pass
					if (err) throw err;
				});
			});
   		}
	});
}
//check if a user exists
exports.userExist = function(req, res, next) {
    User.count({username: req.body.username}, function (err, count) {
        if (count === 0)  next();
        else res.send(400, '{"error":"this user name already exists"}');
    });
}

exports.login = function (req, res) {
	var username = req.body.username;
	var	pass = req.body.password;
	if(username == undefined) { //login via a GET
		username = req.params.username;
		pass = req.params.password;
	}
	if(username == undefined || pass == undefined) res.send(400, '{"error":"authentication failed, username or password are not define"}');
	else {
		authenticateElem(username, pass, function (err, user) {
			if (user) {
				req.session.regenerate(function () {
					req.session.user = user;
					res.send(200, '{"message":"You have been successfully logged in as '+username+'"}'); 
				});
			} 
			else res.send(400, '{"error":"authentication failed, please check your username or password"}');
		});
	}
}

// create a user
exports.signup = function (req, res) {
	if(req.body.password == undefined || req.body.username == undefined) res.send(400, '{"error":"the username and/or password fields have not been filled up with data"}');
	else {
		var roleuser = req.body.role;
		if(GLOBAL.list_user_role.indexOf(roleuser)==-1)  roleuser = "user";
		hash(req.body.password, function (err, salt, hash) {
			if (err) throw err;
			var user = new User({
				username: req.body.username,
				affiliation: req.body.affiliation,
				role: roleuser,//req.body.role,
				salt: salt,
				hash: hash,
			}).save(function (err, newUser) {
				if (err) throw err;
				if(newUser)res.send(200, newUser);
			});
		});		
	}
}

exports.racine = function (req, res) {
    if (req.session.user) res.send(200, '{"message":"user is logged as ' + req.session.user.username+'"}' );
}

// used for test, and it will be removed from the production version
exports.logout = function (req, res) {
    if(req.session.user) {
    	var uname = req.session.user.username;
    	req.session.destroy(function () {
        	res.send(200, '{"message":"' +uname + ' is logged out"}');
    	});
    }
}

// remove a given group ID, also remove this group in the ACL table
exports.removeGroupByID  = function (req, res) {
    if(req.params.id == undefined) return res.send(400, '{"error":"The id parameter has not been sent"}');
	Group.remove({_id : req.params.id}, function(error, data){
		if(error) res.json(error);			//Error in deleting one annotation		
		else {
			ACLAPI.removeAGroupFromALC(data.groupname);
			res.send(data);
		}
	});    
}
