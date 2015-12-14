# coding=utf-8
import os, subprocess, uuid, time
import json
import sqlite3
from flask import Flask, request, make_response, redirect, url_for, render_template, send_from_directory, jsonify, send_file
from werkzeug import secure_filename
from functools import wraps

import config # contains API secrets

from twilio.rest import TwilioRestClient
from twilio import TwilioRestException

import logging

twilioClient = TwilioRestClient(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN) 

UPLOAD_FOLDER = config.FILESYSTEM_BASE + u'/uploads'
GIF_FOLDER = config.FILESYSTEM_BASE + u'/gifs'
TMP_FOLDER = config.FILESYSTEM_BASE + u'/tmp'
ALLOWED_EXTENSIONS = set(['jpg', 'jpeg', 'gif', 'png'])

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['GIF_FOLDER'] = GIF_FOLDER
app.config['TMP_FOLDER'] = TMP_FOLDER

# Set up logging to a file we can read
logging.basicConfig(filename=config.FILESYSTEM_BASE + u'/log', level=logging.DEBUG)
logger = logging.getLogger('werkzeug')
handler = logging.FileHandler(config.FILESYSTEM_BASE + u'/log')
logger.addHandler(handler)
app.logger.addHandler(handler)

app.logger.debug("LOADED")

# Get rid of the weird bins.fcgi at the end of the URL
# ----------------------------------------------------------------------------
def strip_suffix(app, suffix):
    def wrapped_app(environ, start_response):
        if environ['SCRIPT_NAME'].endswith(suffix):
            environ['SCRIPT_NAME'] = environ['SCRIPT_NAME'][:-len(suffix)]
        return app(environ, start_response)
    return wrapped_app

app.wsgi_app = strip_suffix(app.wsgi_app, '/swirl.fcgi')
# ----------------------------------------------------------------------------

# Authentication/admin stuff
# ----------------------------------------------------------------------------
def authenticate(f):
    ''' Function used to decorate routes that require user login '''
    @wraps(f)
    def new_f(*args, **kwargs):
        if not logged_in():
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return new_f

def logged_in():
    return True
    #return session.has_key("loggedin") and session["loggedin"] == "yes";

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")
    else:
        if request.form["password"] == "d0ublefac3":
            session['loggedin'] = "yes"
            flash("Logged in!")
            return redirect(url_for("index"))
        else:
            flash("Wrong password!")
            return redirect(url_for("login"))

@app.route("/logout", methods=["GET"])
def logout():
    session['loggedin'] = "no"
    flash("Logged out!")
    return redirect(url_for("login"))    
# ----------------------------------------------------------------------------

def allowed_file(filename):
    return '.' in filename and \
        filename.rsplit('.', 1)[1] in ALLOWED_EXTENSIONS

@app.route('/')
def index():
     return u"DOUBLE FACE | ƎƆAᖷ Ǝ⅃ᙠUOᗡ"

# Debugging views
# ----------------------------------------------------------------------------
@app.route('/capture', methods=["GET"])
def show_upload_form():
    """Returns a template for uploading several files to create a gif for debugging purposes"""
    return render_template("capture.html", cookies = request.cookies)

# API Endpoints
# ----------------------------------------------------------------------------
@app.route('/sms', methods=["POST"])
def send_sms():
    """Send out the included gif as an SMS"""
    data = request.get_json()

    try:
        body_text = u"🎉🎈 Thanks for 🌀ing with us!\n〰 View the full-resolution GIF at: {}{}  〰\n\n 🌀 by 💾🌵 (pronounced 'disk cactus')".format(config.URL_BASE, data["gifURL"])
        
        m = twilioClient.messages.create(
            to=data["phoneNumber"], 
            from_=config.TWILIO_FROM_NUMBER, 
            body=body_text, 
            media_url= config.URL_BASE + data["gifURL"] 
        )    
        return jsonify(status="OK", message=m.sid)

    except TwilioRestException as e:
        return jsonify(status="ERROR", message=e)

@app.route('/visualize', methods=["GET"])
def render_visualizer():
    return render_template("visualize.html", admin="false", cookies = request.cookies)
    
@app.route('/admin', methods=["GET"])
def render_admin():
    return render_template("admin.html", admin="true", cookies = request.cookies)

    
@app.route('/settings', methods=["POST"])
def set_settings():
    """ Takes display settings in as form variables and sets them as cookies """
    next = url_for("render_visualizer")
    try:
        next = request.form['next']
    except KeyError:
        pass
        
    # Set cookies
    resp = make_response(redirect(next))
    for c in config.COOKIES:
        try:
            resp.set_cookie(c, request.form[c])
        except KeyError:
            pass
    
    # Check to see if this cluster/screen exists in the database already. Add it if not.
    event = request.form['event'] or request.cookies.get('event') or config.COOKIES['event']
    cluster = request.form['cluster'] or request.cookies.get('cluster') or config.COOKIES['cluster']
    screen = request.form['screen'] or request.cookies.get('screen') or config.COOKIES['screen']

    with sqlite3.connect("events/{}.db".format(event)) as db:
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        cursor.execute("SELECT * FROM screens WHERE id IS ? LIMIT 1", ("{}.{}".format(cluster, screen), ))
        s = cursor.fetchone()
        if s is None:
            cursor.execute("INSERT INTO screens(id, n, cluster, status) VALUES(?, ?, ?, ?)", ("{}.{}".format(cluster, screen), screen, cluster, "configuring"))
            db.commit()
    
    return resp

@app.route('/status', methods=["GET", "POST"])
def get_screen_status():
    """ Get or set the requesting screen's status. Can be one of the following: 'capturing', 'waiting', 'reviewing' or 'configuring' """
    event = request.cookies.get('event') or config.COOKIES['event']
    cluster = request.cookies.get('cluster') or config.COOKIES['cluster']
    screen = request.cookies.get('screen') or config.COOKIES['screen']
    
    with sqlite3.connect("events/{}.db".format(event)) as db:
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        
        if request.method == "POST":
            cursor.execute("UPDATE screens SET status = ? WHERE id IS ?", (request.form["status"], "{}.{}".format(cluster,screen)))
            db.commit()
            
            
        cursor.execute("SELECT * FROM screens WHERE id IS ? LIMIT 1", ("{}.{}".format(cluster, screen), ))
        screen = cursor.fetchone()
        
        cursor.execute("SELECT * FROM screens WHERE cluster IS ?", (cluster, ))
        screens = [dict(s) for s in cursor.fetchall()]
        
        if screen is not None:
            return jsonify({"event": event, "screen": dict(screen), "cluster": screens})
        else:
            return "no data"


@app.route('/images/<id>', methods=["GET"])
def get_image(id):
    ''' Serve the image file for this event based on its id '''
    event = request.cookies.get('event') or config.COOKIES['event']

    directory = os.path.join(config.FILESYSTEM_BASE, event, "uploads")
    filename =  "{}.jpg".format(id)
    
    return send_from_directory(directory, filename)

    
@app.route('/sequence/<sequence>/images', methods=["POST", "GET"])
def upload_image(sequence):
    event = request.cookies.get('event') or config.COOKIES['event']
    cluster = request.cookies.get('cluster') or config.COOKIES['cluster']
    screen = request.cookies.get('screen') or config.COOKIES['screen']
    
    if request.method == "POST":
        # Process base64-encoded image, create a database entry for it, and write it to disk
        data = request.get_json()
        facedata = data["face"]
        
        with sqlite3.connect("events/{}.db".format(event)) as db:
            db.row_factory = sqlite3.Row
            cursor = db.cursor()
            cursor.execute("INSERT INTO photos(sequence, screen) VALUES(?,?)", (sequence, "{}.{}".format(cluster,screen)))
            new_id = cursor.lastrowid;
            
            # Now that we have an id for this image, write it to disk.
            directory = os.path.join(config.FILESYSTEM_BASE, "events", event, "uploads")
            filename =  os.path.join(directory, "{}.jpg".format(new_id))
            
            if not os.path.exists(directory):
                os.makedirs(directory)
                
            with open(filename, "wb") as f:
                f.write(facedata.decode('base64'))
                
            cursor.execute("UPDATE photos SET filename = ? WHERE id = ?", (filename, new_id))

            db.commit()

            # If enough pictures have been taken, close this sequence and set all screens to status = 'reviewing'
            cursor.execute("SELECT * FROM photos WHERE sequence IS ?", (sequence, ))
            n_taken = len(cursor.fetchall())
            
            if n_taken >= 9:
                cursor.execute("UPDATE sequences SET status = 'done' WHERE id IS ?", (sequence, ))
                cursor.execute("UPDATE screens SET status = 'reviewing' WHERE cluster = ?", (cluster, ))
                db.commit()
            
            else:
                # Figure out which screen follows this one and update its status to 'capturing'
                cursor.execute("SELECT * FROM screens WHERE cluster IS ?", (cluster,))
                #screens = [s['n'] for s in cursor.fetchall()]
                screens = [s['n'] for s in cursor.fetchall() if (s['status'] == 'waiting' or s['status'] == 'capturing')]
                screens.sort()
                next_screen = screens[(screens.index(int(screen))+1) % len(screens)]
                
                cursor.execute("UPDATE screens SET status = 'waiting' WHERE cluster = ? AND n = ?", (cluster, screen))
                cursor.execute("UPDATE screens SET status = 'capturing' WHERE cluster = ? AND n = ?", (cluster, next_screen))
                db.commit()

            return str(new_id)
        
        return "COULD NOT PROCESS IMAGE FILE"
    
    else:
        with sqlite3.connect("events/{}.db".format(event)) as db:
            db.row_factory = sqlite3.Row
            cursor = db.cursor()
    
            # Get all photos in this sequence in order
            cursor.execute("SELECT * FROM photos WHERE sequence IS ? ORDER BY id ASC", (sequence, ))
            photos = [dict(p) for p in cursor.fetchall()]
            
            return jsonify({"photos": photos})

@app.route('/<event>/<sequence>/gif', methods=["GET"])
@app.route('/sequence/<sequence>/gif', methods=["GET"],  defaults={"event": None})
def get_gif(event, sequence):
    ''' Return a gif of this sequence if it's ready (or generate it if it's not) '''
    event = event or request.cookies.get('event') or config.COOKIES['event']
    cluster = request.cookies.get('cluster') or config.COOKIES['cluster']
    screen = request.cookies.get('screen') or config.COOKIES['screen']

    tmp_directory = os.path.join(config.FILESYSTEM_BASE, "events", event, "uploads")
    gif_directory = os.path.join(config.FILESYSTEM_BASE, "events", event, "gifs")
    if not os.path.exists(tmp_directory):
        os.makedirs(tmp_directory)
    if not os.path.exists(gif_directory):
        os.makedirs(gif_directory)
        
    tmp_filename = os.path.join(tmp_directory, "{}.gif".format(sequence))
    gif_filename = os.path.join(gif_directory, "{}.gif".format(sequence))


    # If the gif file already exists, serve it out as is
    if os.path.exists(gif_filename):
        return send_from_directory(gif_directory, "{}.gif".format(sequence))
        
    # If the tmp file exists, this gif is already processing so just hold on tight for 30 seconds before regenerating
    if os.path.exists(tmp_filename):
        for i in range(0, 300):
            time.sleep(.1)
            if os.path.exists(gif_filename):
                return send_from_directory(gif_directory, "{}.gif".format(sequence))
    
    # With no tmp file and no gif file, this request will have to generate the gif on its own.
    #Get a list of image filenames from the database
    with sqlite3.connect("events/{}.db".format(event)) as db:
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        cursor.execute("SELECT * FROM photos WHERE sequence is ?", (sequence, ))
        face_filenames = [(u"'" + p["filename"] + u"'") for p in cursor.fetchall()]
    
    command = u"convert -delay 12 -loop 0 "
    command += u" ".join(face_filenames)
    command += u" '{tmp_name}'; mv '{tmp_name}' '{gif_name}'".format(gif_name=gif_filename,  tmp_name=tmp_filename)

    subprocess.call(command, shell=True)
    
    return send_from_directory(gif_directory, "{}.gif".format(sequence))

@app.route('/sequence/<sequence>/delete', methods=["GET", "DELETE"])
def delete_sequence(sequence):
    """ Delete a given sequence form the database and remove its gif from the gifs folder """
    event = request.cookies.get('event') or config.COOKIES['event']
    with sqlite3.connect("events/{}.db".format(event)) as db:
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        cursor.execute("DELETE FROM sequences WHERE id is ?", (sequence, ))
        
        
        gif_directory = os.path.join(config.FILESYSTEM_BASE, event, "gifs")
        gif_filename = os.path.join(gif_directory, "{}.gif".format(sequence))
        
        if os.path.exists(gif_filename):
            os.unlink(gif_filename)
            
        return "OK"
    
    return "COULD NOT DELETE SEQUENCE"
    


@app.route('/sequences', methods=["GET"])
def get_sequences():
    event = request.cookies.get('event') or config.COOKIES['event']
    with sqlite3.connect("events/{}.db".format(event)) as db:
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        cursor.execute("SELECT * FROM sequences WHERE status is 'done' ORDER BY id DESC")
        sequences = [dict(s) for s in cursor.fetchall()]
        
        return jsonify({"sequences": sequences})
    



@app.route('/rebuild')
def rebuild_database():
    """ Rebuild database schema for an event """
    event = request.cookies.get('event') or config.COOKIES['event']
    
    # TODO: Make this filename safe
    with sqlite3.connect("events/{}.db".format(event)) as db:
        cursor = db.cursor()
        cursor.execute("DROP TABLE IF EXISTS screens")
        cursor.execute("DROP TABLE IF EXISTS photos")
        cursor.execute("DROP TABLE IF EXISTS sequences")
        
        cursor.execute("pragma foreign_keys = on")
        
        # Screen id is a combo of a cluster.n (i.e. id=5.3 is the 3rd screen in sequence of cluster #5)
        cursor.execute("CREATE TABLE screens(id KEY, n INTEGER, cluster INTEGER KEY, status)")
        cursor.execute("CREATE TABLE sequences(id INTEGER PRIMARY KEY AUTOINCREMENT, cluster, status, FOREIGN KEY(cluster) REFERENCES screens(cluster))")
        cursor.execute("""
            CREATE TABLE photos(id INTEGER PRIMARY KEY AUTOINCREMENT, sequence, screen,
                                n INTEGER,
                                filename,
                                FOREIGN KEY(sequence) REFERENCES sequences(id),
                                FOREIGN KEY(screen) REFERENCES screens(id))
        """)
        
        
    return u"<h1>Database rebuilt for event: " + event + "</h1>";


@app.route('/nextSequence', methods=["GET"])
def get_next_sequence():
    event = request.cookies.get('event') or config.COOKIES['event']
    cluster = request.cookies.get('cluster') or config.COOKIES['cluster']
    screen = request.cookies.get('screen') or config.COOKIES['screen']
    
    with sqlite3.connect("events/{}.db".format(event)) as db:
        db.row_factory = sqlite3.Row
        cursor = db.cursor()
        # Check if there are any new sequences awaiting photos
        cursor.execute("SELECT * FROM sequences WHERE cluster is ? AND status is 'active'", (cluster, ))
        sequence = cursor.fetchone()
        if sequence is None:
            # Create a new sequence entry
            cursor.execute("INSERT INTO sequences(cluster, status) VALUES(?,?)", (cluster, "active"))
            db.commit()
            return str(cursor.lastrowid)
            
        else:
            return str(sequence["id"])


@app.route('/reset', methods=["POST", "GET"])
def reset_settings():
    """ Clears all cookies so they return to defaults """
    next = url_for("render_visualizer")
    if request.method == "POST":
        try:
            next = request.form['next']
        except KeyError:
            pass
        
    # Clear cookies
    resp = make_response(redirect(next))
    for c in config.COOKIES:
        resp.set_cookie(c, '', expires=0)

    return resp


app.secret_key = config.SESSION_SECRET_KEY
app.debug = True
if __name__ == '__main__':
    app.run()
