#!/home2/slowerin/www/diskcactus/swirl/venv/bin/python

from flup.server.fcgi import WSGIServer
from swirl_app import app as application

WSGIServer(application).run()
