var request = require("request");
var async = require("async");

var api_key = "AIzaSyA7B2nB1Vf9qDp8WTudwBvvbd1Oz2123-A";

var channels_url = "https://www.googleapis.com/youtube/v3/channels";
var playlistItems_url = "https://www.googleapis.com/youtube/v3/playlistItems";
var captions_url = "https://www.googleapis.com/youtube/v3/captions";
var search_url = "https://www.googleapis.com/youtube/v3/search";
var timedtext_url = "https://www.youtube.com/api/timedtext";

function isEnglishStandard(caption) {
    return (caption.snippet.trackKind == 'standard' && caption.snippet.language == 'en');
}

function get_caption_details(videoId, callback) {
    var options = {
        method: 'GET',
        url: captions_url,
        qs: {
            part: 'snippet',
            videoId: videoId,
            key: api_key
        },
        json: true
    };
    // console.log(JSON.stringify(options));
    request(options, callback);
}

function get_caption_content(params, callback) {
    var options = {
        method: 'GET',
        url: timedtext_url,
        qs: {
            // v: videoId,
            lang: 'en'
        }
    };
    for(key in params)
        options.qs[key] = params[key];
    request(options, callback);
}

function get_english_caption(videoId, callback) {
    async.waterfall([
        function(cbw) {
            get_caption_details(videoId, function(errcd, respcd, bodcd) {
                if(errcd) console.log(errcd);
                // console.log(JSON.stringify(bodcd) + '\n');
                cbw(null, bodcd.items);
            });
        },
        function(captions, cbw) {
            async.detect(captions, async.asyncify(isEnglishStandard), cbw);
        },
        function(english_caption, cbw) {
            var params = {
                v: videoId
            };
            if(!english_caption)
                cbw(`\n\n\n\n\n\n\n\n+++++++++++++\nNo English Captions\n+++++++++++++++\n${videoId}\n\n\n\n\n\n\n`);
            else {
                // console.log(JSON.stringify(english_caption));
                if(english_caption.snippet.name != '')
                    params.name = english_caption.snippet.name;
                    
                get_caption_content(params, function(errc, respc, bodc) {
                    if(errc) console.log(errc);
                    console.log("\n=============================================================\n");
                    console.log(videoId + '\n');
                    console.log(bodc);
                    // cbw(null, bodc);
                    cbw(null);
                });
            }
        }
    ], callback);
}

function channel_scan(username) {
    // id: 'UCvQECJukTDE2i6aCoMnS-Vg',
    async.waterfall([
        function(cb) {
            var options = {
                method: 'GET',
                url: channels_url,
                qs: {
                    part: 'contentDetails',
                    forUsername: username,
                    key: api_key
                },
                json: true
            };
            request(options, cb);
        },
        function(response, body, cb) {
            var options = {
                method: 'GET',
                url: playlistItems_url,
                qs: {
                    part: 'contentDetails',
                    playlistId: body.items[0].contentDetails.relatedPlaylists.uploads,
                    maxResults: 50,
                    key: api_key
                },
                json: true
            };
            request(options, cb);
        },
        function(response, body, cb) {
            async.each(body.items, function(video, cbe) {
                var options = {
                    method: 'GET',
                    url: captions_url,
                    qs: {
                        part: 'id',
                        videoId: video.contentDetails.videoId,
                        key: api_key
                    }
                };
                request(options, function(err, resp, bod) {
                    console.log(bod);
                    cbe();
                    // cbe(null, bod);
                });
            }, cb);
        }
    ]);
}

function search(params) {
    var options = {
        method: 'GET',
        url: search_url,
        qs: {
            // q: query,
            // pageToken: 'CDIQAA',
            part: 'snippet',
            maxResults: 50,
            safeSearch: "none",
            type: "video",
            videoCaption: "closedCaption",
            key: api_key
        },
        json: true
    };
    for(key in params)
        options.qs[key] = params[key];
    
    async.waterfall([
        function(cbw) {
            request(options, cbw);
        },
        function(respv, bodv, cbw) {
            async.each(bodv.items, function(item, cbe) {
                get_english_caption(item.id.videoId, cbe);
            }, function(err, data) {
                if(err) console.log(err);
                cbw(null, bodv);
            });
        }
    ], function(err, data) {
        console.log("\nNext Page: " + data.nextPageToken);
    });
}

// channel_scan("bigthink");
search({ 
    channelId: "UCvQECJukTDE2i6aCoMnS-Vg",
    pageToken: 'CDIQAA'
});
