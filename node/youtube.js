var request = require("request");
var async = require("async");

var api_key = "AIzaSyA7B2nB1Vf9qDp8WTudwBvvbd1Oz2123-A";

var channels_url = "https://www.googleapis.com/youtube/v3/channels";
var playlistItems_url = "https://www.googleapis.com/youtube/v3/playlistItems";
var captions_url = "https://www.googleapis.com/youtube/v3/captions";
var search_url = "https://www.googleapis.com/youtube/v3/search";
var timedtext_url = "https://www.youtube.com/api/timedtext";
var youtube_url = "https://www.youtube.com/watch";

var allowASR = false;

function get_asr_captions(videoId, callback) {
    var options = {
        method: 'GET',
        url: youtube_url,
        qs: {
            v: videoId
        }
    };
    async.waterfall([
        async.apply(request, options), //request(options, callback);
        function(respyt, bodyt, cbw) {
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]+)"/);
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]*kind(%[A-F0-9][A-F0-9])+asr[^"]*)"/);
            // var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]*kind(%[A-F0-9][A-F0-9])+asr.*?)\\u\d+.*"/);
            var results = bodyt.match(/"\s*caption_tracks\s*"\s*:\s*"[^"]*(https[^"]*kind(%[A-F0-9][A-F0-9])+asr.*?)(\\u\d+.*?)?"/);
            // if(results) console.log("Results " + results[1]);
            if(results) 
                cbw(null, decodeURIComponent(results[1]).replace(/\&amp\;/g, "&")); //.replace(/\&amp\;/g, "&")
            else
                cbw("Couldn't Find any ASR tracks");
        }
    ], function(err, asr_url) {
        if(err) {
            // console.log("\n\n\n\n\n\n\n\n+++++++++++++++\nCaptions unavailable\n+++++++++++++++\n\n\n\n\n\n\n\n");
            callback(err);
        }
        else {
            request({
                method: 'GET',
                url: asr_url
            }, callback);
        }
    });
}

function get_channel_ID(username, callback) {
    var options = {
        method: 'GET',
        url: channels_url,
        qs: {
            part: 'id',
            forUsername: username,
            key: api_key
        },
        json: true
    };
    // console.log(JSON.stringify(options));
    request(options, callback);
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
                // console.log(JSON.stringify(bodcd, null, 2));
                cbw(null, bodcd.items);
            });
        },
        function(captions, cbw) {
            var asr_alt = null;
            async.detect(captions, function(caption, cbt) {
                if(caption.snippet.language == 'en') {
                    if(caption.snippet.trackKind == 'standard') {
                        // console.log(JSON.stringify(caption, null, 2));
                        cbt(null, true);
                    }
                    else { // if(caption.snippet.trackKind == 'ASR')
                        // console.log(JSON.stringify(caption));
                        asr_alt = caption;
                        cbt(null, false);
                    }
                }
                else
                    cbt(false);

            }, function(err, result) {
                // console.log("result: " + videoId + " " + JSON.stringify(result));
                if(result){
                    cbw(err, result);
                }
                else if(allowASR && asr_alt){
                    cbw(err, asr_alt);
                }
                else{
                    cbw(null, null);
                }
            });
        },
        function(english_caption, cbw) {
            var params = {
                v: videoId
            };
            if(!english_caption)
                cbw(`\n\n\n\n\n\n\n\n++++++++++++++++++++\nNo English Captions\n++++++++++++++++++++\n${videoId}\n\n\n\n\n\n\n`);
            else if(english_caption.snippet.trackKind == "standard"){
                // console.log("Captions: "  + JSON.stringify(english_caption));
                if(english_caption.snippet.name != '')
                    params.name = english_caption.snippet.name;
                
                get_caption_content(params, function(errc, respc, bodc) {
                    if(errc) console.log(errc);
                    console.log("\n============================STANDARD==============================\n");
                    console.log(videoId + '\n');
                    console.log(bodc);
                    // cbw(null, bodc);
                    cbw(null);
                });
            }
            else if(allowASR) {
                get_asr_captions(videoId, function(errc, respc, bodc) {
                    if(errc) console.log(errc);
                    console.log("\n============================ASR==============================\n");
                    console.log(videoId + '\n');
                    if(bodc)
                        console.log(bodc);
                    else
                        console.log("\n\n\n\n\n\n\n\n++++++++++++++++++++\nCaptions unavailable\n++++++++++++++++++++\n\n\n\n\n\n\n\n");
                    // cbw(null, bodc);
                    cbw(null);
                });
            }
        }
    ], callback);
}

function search_youtube(params, amount, displayCaptions, callback) {
    async.whilst(()=>amount > 0, function(cbwhilst) {
        var options = {
            method: 'GET',
            url: search_url,
            qs: {
                // q: query,
                // pageToken: 'CDIQAA',
                part: 'id', // Or snippet
                maxResults: ((amount > 50)?50:amount),
                safeSearch: "none",
                type: "video",
                videoCaption: allowASR?"any":"closedCaption",
                key: api_key
            },
            json: true
        };
        console.log(JSON.stringify(options, null, 2));
        async.waterfall([
            function(cbw) {
                if(!params.channelId && params.username) {
                    console.log(params.username);
                    get_channel_ID(params.username, cbw);
                }
                else
                    cbw(null, null, null);
            },
            function(respc, bodc, cbw) {
                if(bodc) {
                    delete params.username;
                    params.channelId = bodc.items[0].id;
                }
                for(key in params)
                    options.qs[key] = params[key];
                console.log(JSON.stringify(options, null, 2));
                request(options, cbw);
            },
            function(respv, bodv, cbw) {
                // console.log(JSON.stringify(bodv, null, 2));
                if(displayCaptions) {
                    async.each(bodv.items, function(item, cbe) {
                        get_english_caption(item.id.videoId, cbe);
                    }, function(err, data) {
                        if(err) console.log(err);
                        cbw(null, bodv);
                    });
                }
                else
                    cbw(null, bodv);
            }
        ], function(err, data) {
            amount -= 50;
            console.log("\nNext Page: " + data.nextPageToken);
            params.pageToken = data.nextPageToken;
            if(!params.pageToken || data.items.length == 0)
                amount = 0;
            cbwhilst(err);
        });
    }, function(err) {
        if(callback)
            callback(err);
    });
}

// channelId: "UCvQECJukTDE2i6aCoMnS-Vg", // bigthink
// channelId: 'UC9-y-6csu5WGm29I7JiwpnA', // Computerphile
// channelId: 'UCIsp57CkuqoPQyHP2B2Y5NA', // MillBeeful

allowASR = true;

search_youtube({
    // username: "JoergSprave",
    // username: "wheeloffortune",
    username: "numberphile",
    order: "date",
    // pageToken: 'CDIQAA'
    // q: "after the unemployment rate declines below"
}, 100, true, null);
