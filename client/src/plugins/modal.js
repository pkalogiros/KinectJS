/*********************************
* KINECT MODAL, 4/02/2012
*---------------------------------
* A modal window which simplifies connecting
* to a KinectSocketServer
**********************************/
(function( kinect ) {
	kinect.modal = {							//randomly select a class
		template : '<div id="knctGrnStrp" class="_c' + (( Math.random() * 4 + 1 ) >> 0 ) + '"><div style="display:none;">\
					<h2>KinectJS</h2><form action="" onsubmit="return kinect.modal._connect()">\
					Please input the Socket Server\'s address and/or port.<br />\
					For more information please visit <a href="http://kinect.childnodes.com">http://kinect.childnodes.com</a>\
					<br /><br /><input id="__prt" type="text"/><input class="submit" type="submit" value="Go" /></form></div></div><div>',
		modal	 : null,										//actual modal object
		/*********************************
		* make( STRING ), chainable added on vI
		*---------------------------------
		* initializes the modal
		* css (string) - Path to custom css file (styling of the modal)
		* if no path is specified the default styling is used
		**********************************/
		make : function( css ) {
			var doc = document,									//document to local variable
				body = doc.getElementsByTagName('body')[0],
				overlay =  doc.createElement('aside'),			//modal overlay, <aside> for political correctness
				cssNode =  doc.createElement('link'),			//css to be appended
				q = this,										//instance of this
				domLoad = function() {							//called on DOMContentLoaded
					doc.removeEventListener( 'DOMContentLoaded', domLoad );
					doc.getElementsByTagName('body')[0].appendChild( overlay );

					doc = domLoad = null;

					q.show();
				};

			cssNode.type = 'text/css';						//configuring the css
			cssNode.id 	= 'kinectModalCSS';					//adding a dummy id so you can grab and kill it if you think its no fun
			cssNode.rel = 'stylesheet';
			cssNode.media = 'screen';

			!css
			? 	cssNode.href = 'http://kinect.childnodes.com/knctModal.css' //my own custom css file - you do not need this if you specify a css argument
			:	cssNode.href = css; //your own css path

			setTimeout(function(){
				var div = q.modal.getElementsByTagName('div')[1];
				if( div )
					div.style.display = 'block';
				div = null;
			},500);

			doc.getElementsByTagName('head')[0].appendChild( cssNode );
			overlay.id = 'kinectModal';
			overlay.innerHTML = q.template;

			q.modal = overlay;

			//listeners - making the modal reappear on disconnect etc
			kinect.addEventListener( 'openedSocket', function() {
				q.hide();	//if we are connected to a valid socket hide the modal
			});

			kinect.addEventListener( 'closedSocket', function() {	//socket disconected
				q.modal.firstChild.className = "closedSocket";
				q.show();
			});

			kinect.addEventListener( 'invalidSocket', function() {	//if the user didnot provide a valid value...
				q.modal.firstChild.className = "invalidSocket";
				q.show();
			});

			if( this.is_ready ) {
				q.hide();
				body.appendChild( overlay );

				overlay = cssNode = body = null;
				return this;
			}

			if( body ) {
				body.appendChild( overlay );
				q.show();
				domLoad = null;
			}
			else
				doc.addEventListener( 'DOMContentLoaded', domLoad, false );

			setTimeout( function() {	//start with the modal's window focused
				if( document.getElementById('__prt') )
					document.getElementById('__prt').focus();
			}, 260);

			overlay = cssNode = body = null;
			return kinect;
		},
		/*********************************
		* show(), added on vI
		*---------------------------------
		* shows the modal
		**********************************/
		show : function() {
			this.modal.className = 'act';
			this.is_visible = true;
			return false;
		},
		/*********************************
		* hide(), added on vI
		*---------------------------------
		* hides the modal
		**********************************/
		hide : function() {
			this.modal.className = '';
			this.is_visible = false;
			return false;
		},
		/*********************************
		* _connect(), added on vI
		*---------------------------------
		* Tries to connect to the websocket
		**********************************/
		_connect : function() {
			var data = document.getElementById('__prt').value;
			this.onConnect( data );

			return false;
		},
		/*********************************
		* onConnect( STRING ), added on vI
		*---------------------------------
		* if valid data is specified, tried to connect
		* to that data (address)
		*
		* data (string) - should be either a port or a full
		* blown address
		**********************************/
		onConnect : function( data ) {
			if( data.length > 3 )
				kinect.make( data );

			return false;
		}
	};
	//END
})( kinect );