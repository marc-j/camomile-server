/* The API controller
   Exports 3 methods:
   * post - Creates a new annotation
   * listAll - Returns a list of annotations
   * listWithId - Returns a specific annotation of a given id
*/

var Layer = require('../models/Layer').Layer; //get the layer model
var Annotation = require('../models/Annotation').Annotation; //get the annotation model

var ACL = require('../models/ACL').ACL,
	ACLAPI = require('../controllers/ACLAPI'),
	Group = require('../models/Group').Group,
	commonFuncs = require('../lib/commonFuncs');

// for the uri : app.get('/corpus/:id_corpus/media/:id_media/layer/:id_layer/annotation', 
/*exports.listAll = function(req, res){
	Annotation.find({id_layer : req.params.id_layer}, function(error, data){
		if(error){
			res.json(error);
		}
		else if(data == null){
			res.json('no such id_layer!')
		}
		else
			res.json(data);
	});
} */

exports.listAll = function(req, res){
	function emptyAsync(callback) {
		setTimeout(function() {callback();}, 1000);
	}
	
	function final(resultReturn, n) { 
		if(resultReturn.length == 0 && n > 0)										
			res.json(403, "You dont have enough permission to get this resource");
		else res.json(resultReturn);
	}
	
	Annotation.find({id_layer : req.params.id_layer}, function(error, data){
		if(error){
			res.json(error);
		}
		else {
			var connectedUser = req.session.user;
			if(GLOBAL.no_auth == true || (connectedUser != undefined && connectedUser.role == "admin")){
				res.json(data);
			}
			else if(connectedUser != undefined && data != null){
				//first find the groups to which the connecteduser belongs
				Group.find({'usersList' : {$regex : new RegExp(connectedUser.username, "i")}}, function(error, dataGroup) {
					if(error) throw error;
					else {
					
						result = [];//JSON.stringify(data);
						resultReturn = [];
					
						for(var i = 0; i < data.length; i++){
							result.push(data[i]._id);
						}
						
						ACL.find({id:{$in:result}}, function(error, dataACL){
							if(error) console.log("error in ACL-corpusListall:");
							else if(dataACL != null){
								var dataACLLen = dataACL.length;
								var countTreatedACL = 0;
								for(var i = 0; i < dataACL.length; i++){ 
									var foundPos = commonFuncs.findUsernameInACL(connectedUser.username, dataACL[i].users);

									if(foundPos != -1) { 
										if(dataACL[i].users[foundPos].right != 'N') {
											resultReturn.push(data[i]);
											countTreatedACL += 1;
										}
									} // not found user's right, find its group's one
									else {
										foundPos = commonFuncs.findUsernameInGroupACL(dataGroup, dataACL[i].groups);

										if(foundPos != -1) {
											if(dataACL[i].groups[foundPos].right != 'N') {
												resultReturn.push(data[i]);
												countTreatedACL += 1;
											}
										}
										else { //not found user right, nor group one, do a back propagation
									//		console.log("get id of his parent");
											(function(d){
												parentID = [];
												//be careful, the order of push is important
												parentID.push(req.params.id_layer);
												parentID.push(req.params.id_media); parentID.push(req.params.id_corpus);
												
												ACL.find({id:{$in:parentID}}, function(error, dataACL1){
													if(error) res.send(error);
													else if(dataACL1 != null) {
														countTreatedACL += 1;
														var contd = true;
														for(var j = 0; j < dataACL1.length && contd; j++) {
															var foundPos = commonFuncs.findUsernameInACL(connectedUser.username, dataACL1[j].users);
														
															if(foundPos != -1) {
																if(dataACL1[j].users[foundPos].right != 'N') {
																	resultReturn.push(d); contd = false;
																}
															}
															else {
																foundPos = commonFuncs.findUsernameInGroupACL(dataGroup, dataACL1[j].groups);
							
																if(foundPos != -1) {
																	if(dataACL1[j].groups[foundPos].right != 'N') {
																		resultReturn.push(d); contd = false;
																	}
																	else contd = false; // stop because we already found the right N
																}
															}
														} //for
														if(countTreatedACL == dataACLLen) {
															countTreatedACL = -1
															final(resultReturn, data.length);
														}
													} //else if(dataACL1 != null)
												}); //acl 2
											})(data[i]); // treat the callback function
										} // else { //not found user right	
									}
								} //for
								if(countTreatedACL == dataACLLen) 
									final(resultReturn, data.length);
							}
						}); //ACL.find
					} //else
				}); // group
				//res.json(resultReturn);
			} // else if (connectedUser)
			else res.json(403, "You dont have permission to access this resource");
		}
	});
}

//for the uri: app.get('/corpus/:id_corpus/media/:id_media/layer/:id_layer/:id_layer/annotation/:id_anno 
exports.listWithId = function(req, res){
	Annotation.findById(req.params.id_anno, function(error, data){
		if(error){
			res.json(error);
		}
		else if(data == null){
			res.json('no such id_layer!')
		}
		else
			res.json(data);
	});
}

//test for Posting 
//app.post('/corpus/:id_corpus/media/:id_media/layer/:id_layer/annotation', 
exports.post = function(req, res){
	if(req.body.fragment == undefined || req.body.data == undefined || req.body.history == undefined)
		return res.send(404, "one or more data fields are not filled out properly");
		
	Layer.findById(req.params.id_layer, function(error, data){
		if(error){
			res.json(error);
		}
		else if(data == null){
			res.json('Could not post this annotation because the given id_layer is incorrect');
		}
		else {
		
			var annoItem = {
				"id_layer" : req.params.id_layer, // req.body.id_layer,
				"fragment" : req.body.fragment,
				"data" : req.body.data,
				"history" : []//req.body.history
			};
	
			var anno = new Annotation(annoItem);
			//just added 12/07/2013
			var connectedUser = "root";
			if(req.session.user)
				connectedUser = req.session.user.username;
			
			anno.history.push({name : connectedUser, date : new Date()});
	
			anno.save( function(errorAnno, annoData){
				if(errorAnno){
					console.log('error in posting the annotation list');
					console.log(errorAnno);
					//saved = false;
					return;
				}
				else{
					console.log('Success on saving annotation data');
					
					ACLAPI.addUserRightGeneric(annoData._id, connectedUser, 'A');
					res.json(annoData);
				}
			});
		}
	});
}

//test for updating annotation
//app.put('/corpus/:id_corpus/media/:id_media/layer/:id_layer/annotation/:id_anno', 
exports.updateAll = function(req, res){
	//Corpus.update(_id : req.params.id, function(error, data){
	if(req.body.fragment == undefined && req.body.data == undefined)
		return res.send(404, "one or more data fields are not filled out properly");
	var update = {};
	if(req.body.fragment)
		update.fragment = req.body.fragment;
	if(req.body.data)
		update.data = req.body.data;
	/*var update = {
		id_layer : req.params.id_layer, // req.body.id_layer,
		fragment : req.body.fragment,
		data : req.body.data
	};*/
	Annotation.findByIdAndUpdate(req.params.id_anno, update, function (error, anno) {
		if(error){
			res.json(error);
		}
		else
		{
			
			//anno.history.push({name: req.body.history.name, date : req.body.history.date}); //phuong commented on 6th 11 2013
			
			var dateNow = new Date();
			var uname = "root"; 
			if(req.session.user)
				uname = req.session.user.username;
			
			anno.history.push({name:uname, date: dateNow});
			
			anno.save( function(error, data){
				if(error){
					res.json(error);
				}
				else{
					res.json(data);
				}
			});
			//res.json(anno);
		}
	});
}