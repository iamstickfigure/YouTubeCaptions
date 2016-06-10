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

function get_livestream_feed(videoId, callback) {
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
    ], callback);
}

function get_live_captions(live_feed_url, callback) {
    async.waterfall([
        function(cbw) {
            console.log(live_feed_url + "\n");
            request({
                method: 'GET',
                url: live_feed_url
            }, cbw);
        },
        function(respd, bodd, cbw) {
            // console.log(bodd);
            var $ = cheerio.load(bodd);
            var adaptation_set = $('AdaptationSet[mimeType="text/vtt"]');
            var originalURL = $('BaseURL', adaptation_set).text();
            var segments = $('SegmentURL', adaptation_set);

            // console.log(segments.attr("media"));
            var sqs = [];
            segments.each(function() {
                sqs.push($(this).attr("media"));
            });
            cbw(null, {
                baseURL: originalURL,
                sq: sqs
            });

            // var path_params_str = originalURL.replace(webvtt_baseURL, "");
            // var querystring = path_params_str.replace(/\/([^\/]+)\/([^\/]+)/g, "$1=$2&").replace(/^[\/&]*(.*?)[\/&]*$/, "$1");
            // console.log("\n" + originalURL);
            // console.log("\n" + querystring);
            // cbw(null, sprintf("%s?%s", originalURL, querystring));
        }
    ], callback);
}

function get_live_caption_content(baseURL, sq, callback) {
    if(typeof sq == "number")
        sq = `sq/${sq}`;
    var options = {
        method: 'GET',
        url: `${baseURL}${sq}`
    }
    request(options, callback);
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

// get_livestream_feed("uixUv3Ydwt0", function(err, data) {
//     console.log(data);
// });

var feed_url = "https://manifest.googlevideo.com/api/manifest/dash/id/uixUv3Ydwt0.2/sparams/as%2Cgcr%2Chfr%2Cid%2Cip%2Cipbits%2Citag%2Cplaylist_type%2Crequiressl%2Csource%2Cexpire/requiressl/yes/key/yt6/gcr/us/expire/1465612957/playlist_type/LIVE/signature/9C74AA542E33A4D96644375DA0A0AEB1CD88C583.25C00E00C153D106A1E478572F59A783653CAFD2/sver/3/fexp/9416126%2C9416891%2C9417580%2C9422596%2C9425569%2C9427768%2C9428398%2C9428520%2C9431012%2C9433092%2C9433096%2C9433380%2C9433425%2C9433946%2C9434087%2C9435188%2C9435252%2C9435526%2C9435780%2C9435876%2C9436102%2C9436275%2C9436998%2C9437066%2C9437283%2C9437552%2C9438657%2C9438955%2C9438965/ip/107.1.143.3/upn/4B9twh7r4GM/source/yt_live_broadcast/itag/0/ipbits/0/as/fmp4_audio_clear%2Cwebm_audio_clear%2Cwebm2_audio_clear%2Cfmp4_sd_hd_clear%2Cwebm2_sd_hd_clear/hfr/1";

get_live_captions(feed_url, function(err, data) {
    console.log(JSON.stringify(data, null, 2));
    // async.eachSeries(data.sq, function(item, cbe) {
    //     get_live_caption_content(data.baseURL, item, function(err, respc, bodc) {
    //         console.log(bodc);
    //         cbe();
    //     });
    // });

    // var captions = [];
    // var sq = 0;
    // async.whilst(()=>sq < 1000, function(cbwhilst) {
    async.times(1000, function(sq, cbt) {
        get_live_caption_content(data.baseURL, sq, function(err, respc, bodc) {
            cbt(err, bodc);
            // console.log(bodc);
            // sq++;
            // cbwhilst(null);
        });
    }, function(err, captions) {
        console.log(captions);
    });
});