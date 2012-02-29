/*********************************
* KINECT NOTIFICATIONS, 4/02/2012
*---------------------------------
* Small pop up notifications that make the
* user aware of actions that occured
* ( for example : player found, lost etc )
**********************************/
(function( kinect ) {
	/*********************************
	* _build(), added on vI
	*---------------------------------
	* builds, configures, and appends the div container
	**********************************/
	var	_build = function() {
		var body = document.getElementsByTagName('body')[0],
			div = document.createElement('div'),
			q = kinect.notif;

		document.removeEventListener( 'DOMContentLoaded', _build );

		div.id = "kinectNotif";
		body.appendChild( div );
		q.cont = div;

		div = body = q = null;
		return false;
	};

	kinect.notif = {
		cont : null,
		duration : 1600,	//duration of each notification
		/*********************************
		* make(), chainable added on vI
		*---------------------------------
		* initializes the notifications module
		**********************************/
		make : function() {
			var body = document.getElementsByTagName( 'body' )[ 0 ],
				q = this;

			if( body )
				_build();
			else
				document.addEventListener( 'DOMContentLoaded', _build, false );

			return kinect;
		},

		/*********************************
		* push( STRING, INT ), chainable added on vI
		*---------------------------------
		* Creates a new notification
		* txt (string) - notification's text
		* duration (int) - how long it should stay on the screen
		**********************************/
		push : function( txt, duration ) {
			var cont = this.cont,
				notif = document.createElement( 'span' ),
				notifStyle = notif.style,
				q = this;

			!duration && ( duration = 3820 );

			notif.innerHTML = txt;
			
			if( notif.innerHTML == '' )
				notif.textContent = txt;
				
			cont.appendChild( notif );
			notifStyle.opacity = 0.9;	//making it active

			//scheduling its demise - hacky but sufficient way
			setTimeout(function() {
				notif.className = "kinectFadeOut";
				setTimeout( function() {
					if( cont && notif )
						cont.removeChild( notif );
				}, q.duration );
			}, duration );

			return this;
		},
		/*********************************
		* clearAll(), chainable added on vI
		*---------------------------------
		* Removes all notifications
		**********************************/
		clearAll : function() {
			var cont = this.cont,
				children = cont.childNodes,
				len = children.length;

			while( len-- )
				cont.removeChild( children[ len ] );

			cont = children = len = null;

			return this;
		}
	};
	//end
})( kinect );