var request = require("request");
var async = require("async");
var sprintf = require("sprintf-js").sprintf;
var xml2js = require("xml2js");
var cheerio = require("cheerio");
var node_vtt = new require("node-vtt")();

var api_key = "AIzaSyA7B2nB1Vf9qDp8WTudwBvvbd1Oz2123-A";

var channels_url = "https://www.googleapis.com/youtube/v3/channels";
var playlistItems_url = "https://www.googleapis.com/youtube/v3/playlistItems";
var captions_url = "https://www.googleapis.com/youtube/v3/captions";
var search_url = "https://www.googleapis.com/youtube/v3/search";
var timedtext_url = "https://www.youtube.com/api/timedtext";
var youtube_url = "https://www.youtube.com/watch";

var webvtt_baseURL = "https://manifest.googlevideo.com/api/manifest/webvtt"

function isEnglishStandard(caption) {
    return (caption.snippet.trackKind == 'standard' && caption.snippet.language == 'en');
}

function get_livestream_caption_feed(videoId, callback) {
    var options = {
        method: 'GET',
        url: youtube_url,
        qs: {
            v: videoId
        }
    }
    async.waterfall([
        async.apply(request, options),
        function(resps, bods, cbw) {
            var results = bods.match(/"\s*dashmpd\s*"\s*:\s*"\s*(https[^"]*)"/);
            if(results)
                cbw(null, results[1].replace(/\\\//g, "/")); // TODO: Properly unescape characters
            else
                cbw("Couldn't Find dashmpd to connect to caption stream");
        },
        function(dashmpd_url, cbw) {
            console.log(dashmpd_url + "\n");
            request({
                method: 'GET',
                url: dashmpd_url
            }, cbw);
        },
        function(respd, bodd, cbw) {
            // console.log(bodd);
            var $ = cheerio.load(bodd);
            var originalURL = $('AdaptationSet[mimeType="text/vtt"] BaseURL').text();
            var path_params_str = originalURL.replace(webvtt_baseURL, "");
            var querystring = path_params_str.replace(/\/([^\/]+)\/([^\/]+)/g, "$1=$2&").replace(/^[\/&]*(.*?)[\/&]*$/, "$1");
            // console.log("\n" + originalURL);
            // console.log("\n" + querystring);
            cbw(null, sprintf("%s?%s", webvtt_baseURL, querystring));
            // xml2js.parseString(bodd, cbw);
        }
    ], callback);
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
                key: api_key
            },
            json: true
        };
        async.waterfall([
            function(cbw) {
                if(!params.channelId && params.username) {
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

                console.log(JSON.stringify(options, null, 2) + "\n++++++++++++++++++++++++++++++++++++++++++++++++++++\n\n");
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
            console.log(JSON.stringify(data, null, 2));
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
// search_youtube({
//     // videoCaption: "closedCaption",
//     username: "HSN",
//     order: "date",
//     eventType: "live"
//     // pageToken: 'CDIQAA'
//     // q: "HSN Livestream"
// }, 1000, false, null);

get_livestream_caption_feed("uixUv3Ydwt0", (err, data) => console.log(data));