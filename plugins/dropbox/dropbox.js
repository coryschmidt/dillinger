var fs = require('fs')
  , path = require('path')
  , request = require('request')
  , qs = require('querystring')
  , _ = require('lodash')

var dropbox_config = JSON.parse( fs.readFileSync( 
  path.resolve(__dirname, 'dropbox-config.json'), 'utf-8' ) )

exports.Dropbox = (function(){
  
  var ACCOUNT_INFO_URI = 'https://api.dropbox.com/1/account/info'
    , API_URI = 'https://api.dropbox.com/1'
    , CONTENT_API_URI = 'https://api-content.dropbox.com/1'
    , METADATA_URI = 'https://api.dropbox.com/1/metadata/dropbox/'
    , SEARCH_URI = 'https://api.dropbox.com/1/search/dropbox'
    , FILES_GET_URI = 'https://api-content.dropbox.com/1/files/dropbox'
    , FILES_PUT_URI = 'https://api-content.dropbox.com/1/files_put/dropbox'
    , THUMBNAILS_URI = 'https://api-content.dropbox.com/1/thumbnails/dropbox'
    , DELTA_URI = 'https://api.dropbox.com/1/delta'
  
  return {
    config: dropbox_config,
    getNewRequestToken: function(req,res,cb){

      var url = dropbox_config.request_token_url
        , oauth = { 
                    consumer_key: dropbox_config.app_key
                  , consumer_secret: dropbox_config.app_secret
                  }

      // Create your auth_url for the view   
      request.post({url:url, oauth:oauth}, function (e, r, body) {

        if(e) return cb(e,null)
        
        return cb(null,qs.parse(body))

      }) // end request.post()

    },
    getRemoteAccessToken: function(access_token, request_token_secret, cb){

      var url = dropbox_config.access_token_url
        , oauth = { 
                    consumer_key: dropbox_config.app_key
                  , consumer_secret: dropbox_config.app_secret
                  , token: access_token
                  , token_secret: request_token_secret
                  }

      // Create your auth_url for the view   
      request.get({url:url, oauth:oauth}, function (e, r, body) {

        if(e) return cb(e,null)
        
        return cb(null,qs.parse(body))

      }) // end request.get()
      
    }, // end getRemoteAccessToken()
    getAccountInfo: function(dropbox_obj, cb){
      
      var oauth = { 
                    consumer_key: dropbox_config.app_key
                  , consumer_secret: dropbox_config.app_secret
                  , token: dropbox_obj.oauth.access_token
                  , token_secret: dropbox_obj.oauth.access_token_secret
                  }

      request.get({url: ACCOUNT_INFO_URI, oauth:oauth}, function (e, r, b) {

        if(e) return cb(e,null)

        return cb(null,b)

      }) // end request.post()

      
    }, // end getAccountInfo()
    fetchDropboxFile: function(req,res){
      
      if(!req.session.isDropboxSynced){
        res.type('text/plain')
        return res.status(403).send("You are not authenticated with Dropbox.")
      } 

      var oauth = { 
                    consumer_key: dropbox_config.app_key
                  , consumer_secret: dropbox_config.app_secret
                  , token: req.session.dropbox.oauth.access_token
                  , token_secret: req.session.dropbox.oauth.access_token_secret
                  }
                  
      var pathToMdFile = req.body.mdFile

      // For some reason dropbox needs me to do this...
      // Otherwise, spaces get messed up
      // TODO: DRY THIS UP
      var name = pathToMdFile.split('/').pop()
      var encodedName = encodeURIComponent(name)
      pathToMdFile = pathToMdFile.replace(name, encodedName)

      var uri = FILES_GET_URI + pathToMdFile

      request.get({
        oauth: oauth,
        uri: uri,
        callback: function(e,r,data){
          if(e) {
            console.error(e)
            return res.json(e)
          }
          if(data) {
            return res.json({data: data})
          }        
        }
      })
    },
    searchForFiles: function(dropbox_obj,extensions,cb){
      
      // *sigh* http://forums.dropbox.com/topic.php?id=50266&replies=1
      // See if we can make multiple requests and merge the results
      var uri = SEARCH_URI + "/?query=.zzz&file_limit=500"
      
      var oauth = { 
                    consumer_key: dropbox_config.app_key
                  , consumer_secret: dropbox_config.app_secret
                  , token: dropbox_obj.oauth.access_token
                  , token_secret: dropbox_obj.oauth.access_token_secret
                  }
      var callCounter = 0
      var results = null
      var cbFunc = function (e, r, b) {
        if(e) return cb(e,null)
	
	if( results == null )
	{
	  results = JSON.parse(b)
	}
	else
	{
	  results = results.concat(JSON.parse(b))
	}
	if( callCounter++ < extensions.length ) {
	  uri = uri.replace(extensions[callCounter-1],extensions[callCounter])
	  request.get({url: uri, oauth: oauth}, cbFunc)
	}
	if( callCounter == extensions.length )
	{
	  return cb(null,results)
	}
      }
      uri = uri.replace(".zzz", extensions[callCounter])
      request.get({url: uri, oauth:oauth}, cbFunc) // end request.get()
    },
    saveToDropbox: function(req, res){

      if(!req.session.isDropboxSynced){
        res.type('text/plain')
        return res.status(403).send("You are not authenticated with Dropbox.")
      } 

      var oauth = { 
                    consumer_key: dropbox_config.app_key
                  , consumer_secret: dropbox_config.app_secret
                  , token: req.session.dropbox.oauth.access_token
                  , token_secret: req.session.dropbox.oauth.access_token_secret
                  }

      // TODO: EXPOSE THE CORE MODULE SO WE CAN GENERATE RANDOM NAMES

      var pathToMdFile = req.body.pathToMdFile || '/Dillinger/' + md.generateRandomMdFilename('md')
      var contents = req.body.fileContents || 'Test Data from Dillinger.'
      // For some reason dropbox needs me to do this...
      // Otherwise, spaces and shit get fuct up
      var name = pathToMdFile.split('/').pop()
      var encodedName = encodeURIComponent(name)
      
      pathToMdFile = pathToMdFile.replace(name, encodedName)
      
      var uri = FILES_PUT_URI + pathToMdFile 
      
      request.put({
        oauth: oauth,
        uri: uri,
        body: contents, 
        callback: function(e,r,data){
          if(e) {
            console.error(e)
            return res.json(e)
          }
          if(data) {
            // console.dir(data)
            return res.json({data: data})
          }        
        }
      })

    } // end saveToDropbox
  }
  
})()

